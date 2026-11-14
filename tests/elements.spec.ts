import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
test('34 independent elements render and export with matching frames and VP8/Opus',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('examples/element-motion',{recursive:true});
 await page.goto('/?sample=elements');
 await expect(page.getByRole('heading',{name:'ひと息のコーヒー時間｜要素別アニメーション',exact:true})).toBeVisible();
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();await(await saved).saveAs('examples/element-motion/coffee-elements-project.json');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();await(await downloaded).saveAs('examples/element-motion/coffee-elements.webm');
 await expect(page.getByRole('status')).toContainText('WebMを書き出しました');
 const result=await page.evaluate(async()=>{
  const load=eval('(url)=>import(url)'),{Input,BlobSource,WEBM,CanvasSink,VideoSampleSink}=await load('/tests/browser-tools.ts');
  const {loadAssets,drawFrame}=await load('/src/render.ts'),{elementPose}=await load('/src/elements.ts');
  const p=await(await fetch('/examples/coffee-elements-project.json')).json(),assets=await loadAssets(p);
  const video=document.querySelector('video[aria-label="書き出した動画"]') as HTMLVideoElement;
  const blob=await(await fetch(video.src)).blob(),input=new Input({source:new BlobSource(blob),formats:[WEBM]});
  try{
   const v=await input.getPrimaryVideoTrack(),a=await input.getPrimaryAudioTrack(),sink=new CanvasSink(v);
   let frameCount=0;for await(const sample of new VideoSampleSink(v).samples()){frameCount++;sample.close();}
   let error=0,count=0;const hashes=[],images=[];
   for(const t of [.3,.9,2.7,3.9,8.5,9.9,15.9]){
    const decoded=await sink.getCanvas(t),actual=decoded.canvas.getContext('2d').getImageData(0,0,1280,720).data;
    const c=document.createElement('canvas');c.width=1280;c.height=720;drawFrame(c,p,Math.round(t*30),assets);const expected=c.getContext('2d')!.getImageData(0,0,1280,720).data;
    let hash=0;for(let i=0;i<actual.length;i+=64){error+=Math.abs(actual[i]-expected[i]);count++;hash=(hash*31+actual[i])>>>0;}hashes.push(hash);
    if([3.9,9.9,15.9].includes(t))images.push(decoded.canvas.toDataURL('image/png'));
   }
   const first=p.slides[0].elements,cup=first.find((e:any)=>e.name==='コーヒーカップ'),steam=first.find((e:any)=>e.name==='湯気'),title=first.find((e:any)=>e.name==='見出し');
   return {duration:await input.computeDuration(),videoCodec:v.codec,audioCodec:a.codec,frameCount,elements:p.slides.map((s:any)=>s.elements.length),meanPixelError:error/count,hashes,images,poses:{titleBefore:elementPose(title,.1),titleEntering:elementPose(title,.4),titleAfter:elementPose(title,2),cupEntering:elementPose(cup,.7),steamBefore:elementPose(steam,.8),steamAfter:elementPose(steam,2)}};
  }finally{input.dispose();}
 });
 expect(result.videoCodec).toBe('vp8');expect(result.audioCodec).toBe('opus');expect(result.frameCount).toBe(540);expect(result.duration).toBeCloseTo(18,1);expect(result.elements.reduce((n:number,x:number)=>n+x,0)).toBe(34);
 expect(result.meanPixelError).toBeLessThan(12);expect(new Set(result.hashes).size).toBe(7);
 expect(result.poses.titleBefore.visible).toBe(false);expect(result.poses.titleEntering.y).toBeGreaterThan(result.poses.titleAfter.y);expect(result.poses.cupEntering.scale).toBeLessThan(1);expect(result.poses.steamBefore.visible).toBe(false);expect(result.poses.steamAfter.visible).toBe(true);
 expect(errors).toEqual([]);
 const {images,...verification}=result;
 for(let i=0;i<images.length;i++)await writeFile(`examples/element-motion/scene-${i+1}.png`,Buffer.from(images[i].split(',')[1],'base64'));
 await writeFile('docs/element-motion-verification.json',JSON.stringify(verification,null,2)+'\n');
 await page.screenshot({path:'docs/element-motion-editor.png',fullPage:true});
});
// Element motion is written by the AI assistant: the app shows no element list and no fields to change motion.
test('element motion has no panel; correcting a caption keeps every part inside the slide',async({page})=>{
 await page.goto('/?sample=elements');await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'要素ごとの動き'})).toHaveCount(0);
 for(const label of ['要素名','要素の登場時刻','要素の動き','要素の横位置','表示方法'])await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('一杯のコーヒーから、小さな休憩が始まります。\n湯気の立つカップが、ひと息つく合図です。\n香りに気づいたら、少しだけ手を止めましょう。');
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
 const check=page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();
 const first=JSON.parse(await readFile((await(await check).path())!,'utf8')).slides[0];
 expect(first.captions).toHaveLength(3);for(const e of first.elements)expect(e.start+e.duration).toBeLessThanOrEqual(first.duration+.001);
});
test('invalid element sources and impossible timing are rejected',async({page})=>{
 await page.goto('/?sample=demo');const original=JSON.parse(await readFile('public/examples/coffee-elements-project.json','utf8'));
 for(const mode of ['source','timing']){
  const invalid=structuredClone(original);
  if(mode==='source')invalid.slides[0].elements.find((e:any)=>e.type==='image').src='https://example.com/private-image.png';
  else invalid.slides[0].elements[0].start=50;
  await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await expect(page.getByRole('status')).toContainText('読み込みできません');
 }
});
