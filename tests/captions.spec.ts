import {test,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
test('caption sample exports silently with subtitles burned into matching frames',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('examples/captions',{recursive:true});
 await page.goto('/?sample=captions');
 await expect(page.getByRole('heading',{name:'ひと息のコーヒー時間｜字幕付き（無音）',exact:true})).toBeVisible();
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveValue('湯気の立つ白いカップに、淹れたてのコーヒー。');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();await(await downloaded).saveAs('examples/captions/coffee-captions.webm');
 await expect(page.getByRole('status')).toContainText('WebMを書き出しました');
 const result=await page.evaluate(async()=>{
  const load=eval('(url)=>import(url)'),{Input,BlobSource,WEBM,CanvasSink}=await load('/tests/browser-tools.ts'),{drawFrame,loadAssets}=await load('/src/render.ts');
  const p=await(await fetch('/examples/coffee-captions-project.json')).json(),assets=await loadAssets(p);
  const video=document.querySelector('video[aria-label="書き出した動画"]') as HTMLVideoElement;
  const input=new Input({source:new BlobSource(await(await fetch(video.src)).blob()),formats:[WEBM]});
  try{
   const v=await input.getPrimaryVideoTrack(),sink=new CanvasSink(v);
   // Caption band pixels: dark while a caption is shown, plain slide background before it starts.
   const band=async(t:number)=>{const c=(await sink.getCanvas(t)).canvas.getContext('2d');const d=c.getImageData(640,640,1,1).data;return d[0]+d[1]+d[2];};
   const text=async(t:number)=>{const d=(await sink.getCanvas(t)).canvas.getContext('2d').getImageData(300,600,680,60).data;let bright=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]>200&&d[i+2]>200)bright++;return bright;};
   let error=0,count=0;
   for(const t of [2,6,12]){const actual=(await sink.getCanvas(t)).canvas.getContext('2d').getImageData(0,0,1280,720).data,c=document.createElement('canvas');c.width=1280;c.height=720;drawFrame(c,p,Math.round(t*30),assets);const expected=c.getContext('2d')!.getImageData(0,0,1280,720).data;for(let i=0;i<actual.length;i+=64){error+=Math.abs(actual[i]-expected[i]);count++;}}
   return {audioTracks:(await input.getAudioTracks()).length,codec:v.codec,duration:await input.computeDuration(),textBefore:await text(.1),textDuring:await text(2),meanPixelError:error/count,bandBefore:await band(.1),bandDuring:await band(2)};
  }finally{input.dispose();}
 });
 expect(result.codec).toBe('vp8');expect(result.audioTracks).toBe(0);expect(result.duration).toBeCloseTo(28.5,1);
 expect(result.textBefore).toBe(0);expect(result.textDuring).toBeGreaterThan(200);expect(result.meanPixelError).toBeLessThan(12);
 expect(errors).toEqual([]);
 await writeFile('docs/captions-verification.json',JSON.stringify(result,null,2)+'\n');
 await page.screenshot({path:'docs/captions-editor.png',fullPage:true});
});
test('captions typed one per line are timed at reading speed, lengthen the slide and survive save/import',async({page})=>{
 await page.goto('/?sample=demo');await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 await expect(page.locator('.aside-heading')).toContainText('4.0秒');
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('画像と言葉を重ねて、スライドを動画にします。\n\n音がなくても、字幕で内容が伝わります。');
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveValue('音がなくても、字幕で内容が伝わります。');
 const duration=Number((await page.locator('.aside-heading span').textContent())!.replace('秒',''));expect(duration).toBeGreaterThan(8);
 await page.getByLabel('字幕の文 1',{exact:true}).fill('手で直した字幕。');
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();const path=await(await saved).path();
 const project=JSON.parse(await readFile(path!,'utf8')),captions=project.slides[0].captions;
 expect(captions.map((c:any)=>c.text)).toEqual(['手で直した字幕。','音がなくても、字幕で内容が伝わります。']);
 expect(captions[0].start).toBeCloseTo(.3,2);expect(captions[1].start).toBeGreaterThan(captions[0].start+captions[0].duration);
 expect(captions[1].start+captions[1].duration).toBeLessThanOrEqual(project.slides[0].duration);
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles(path!);await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveValue('手で直した字幕。');
 await page.getByRole('button',{name:'字幕を削除 1',exact:true}).click();await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveCount(0);
});
test('captions outside the slide or too long are rejected',async({page})=>{
 await page.goto('/?sample=demo');const original=JSON.parse(await readFile('public/examples/coffee-captions-project.json','utf8'));
 for(const mode of ['outside','long']){
  const invalid=structuredClone(original);
  if(mode==='outside')invalid.slides[0].captions[0].start=50;else invalid.slides[0].captions[0].text='長'.repeat(121);
  await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await expect(page.getByRole('status')).toContainText('読み込みできません');
 }
});
test('captions of two or more lines break after a phrase, not inside a word',async({page})=>{
 await page.goto('/?sample=demo');
 const result=await page.evaluate(async()=>{
  const {phrases,wrapPhrases}=await eval('(url)=>import(url)')('/src/linebreak.ts');
  const c=document.createElement('canvas').getContext('2d')!;c.font='600 34px sans-serif';
  const measure=(s:string)=>c.measureText(s).width,long='湯気の立つ白いカップに淹れたてのコーヒーを注いで、窓辺の光を眺めながらゆっくりひと息つく時間を毎日の習慣にしています。';
  return{phrases:phrases('湯気の立つ白いカップに、淹れたてのコーヒー。'),numbers:phrases('売上は前年比120%に伸び、3つの店舗（2024年度）。'),lines:wrapPhrases(long,1020,measure,true),widths:wrapPhrases(long,1020,measure,true).map(measure),units:phrases(long),manual:wrapPhrases('一行目\n二行目',1020,measure,true),solid:wrapPhrases('あ'.repeat(80)+'。',1020,measure,true),long};
 });
 expect(result.phrases).toEqual(['湯気の','立つ','白い','カップに、','淹れたての','コーヒー。']);
 expect(result.numbers).toEqual(['売上は','前年比','120%に','伸び、','3つの','店舗','（2024年度）。']);
 expect(result.lines.length).toBe(2);expect(result.lines.join('')).toBe(result.long);
 // Every line ends where a phrase ends, and the two lines are close in width.
 let at=0;const ends=new Set(result.units.map((u:string)=>at+=u.length));expect(ends.has(result.lines[0].length)).toBe(true);
 expect(Math.abs(result.widths[0]-result.widths[1])).toBeLessThan(200);for(const w of result.widths)expect(w).toBeLessThanOrEqual(1020);
 expect(result.manual).toEqual(['一行目','二行目']);
 expect(result.solid.join('')).toBe('あ'.repeat(80)+'。');expect(result.solid.at(-1)!.length).toBeGreaterThan(3);
});
