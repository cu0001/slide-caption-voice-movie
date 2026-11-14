import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const moduleImport = '(url) => import(url)';
test('editable preview, embedded project round trip, WebM with delayed audio and visual fidelity',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  (window as any).__configuredVideo=[];(window as any).__configuredAudio=[];
  const video=VideoEncoder.prototype.configure,audio=AudioEncoder.prototype.configure;
  VideoEncoder.prototype.configure=function(config){(window as any).__configuredVideo.push(config.codec);if(config.codec!=='vp8')throw new Error('Forbidden video codec');return video.call(this,config);};
  AudioEncoder.prototype.configure=function(config){(window as any).__configuredAudio.push(config.codec);if(config.codec!=='opus')throw new Error('Forbidden audio codec');return audio.call(this,config);};
 });
 await page.goto('/?sample=demo');
 await expect(page.getByRole('button',{name:'WebMを書き出す',exact:true})).toBeEnabled();
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 // Captions are the only thing edited in the app; the audio delay comes from the project file itself.
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('アイデアが、動きはじめる。');
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
 await page.screenshot({path:'docs/studio-preview.png',fullPage:true});
 const saved = page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();
 const projectFile=await saved;await projectFile.saveAs('docs/test-project.json');
 const project=JSON.parse(await readFile('docs/test-project.json','utf8'));
 expect(project.audio.src).toMatch(/^data:audio\/wav;base64,/);
 expect(project.slides[0].captions.map((c:any)=>c.text)).toEqual(['アイデアが、動きはじめる。']);
 project.audio.start=1;await writeFile('docs/test-project.json',JSON.stringify(project));
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles('docs/test-project.json');
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 const downloaded=page.waitForEvent('download');
 await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();
 const webm=await downloaded;await webm.saveAs('docs/sample.webm');
 await expect(page.getByRole('status')).toContainText('WebMを書き出しました');
 const result=await page.evaluate(async({moduleImport})=>{
  const load=eval(moduleImport);
  const {Input,BlobSource,WEBM,CanvasSink,AudioSampleSink}=await load('/tests/browser-tools.ts');
  const {loadAssets,drawFrame}=await load('/tests/browser-tools.ts');
  const video=document.querySelector('video[aria-label="書き出した動画"]') as HTMLVideoElement;
  const blob=await(await fetch(video.src)).blob();
  const input=new Input({source:new BlobSource(blob),formats:[WEBM]});
  try {
   const v=await input.getPrimaryVideoTrack();const a=await input.getPrimaryAudioTrack();
   const sink=new CanvasSink(v);const sounds=new AudioSampleSink(a);
   const p=await(await fetch('/docs/test-project.json')).json();const assets=await loadAssets(p);
   let difference=0,pixels=0;const samples=[];
   for(const t of [1,4.25,5,9,11.9]) {
    const decoded=await sink.getCanvas(t);const c=document.createElement('canvas');c.width=1280;c.height=720;
    drawFrame(c,p,Math.round(t*30),assets);
    const expected=c.getContext('2d')!.getImageData(0,0,1280,720).data;
    const actual=decoded.canvas.getContext('2d').getImageData(0,0,1280,720).data;
    let brightness=0;for(let i=0;i<actual.length;i+=64){difference+=Math.abs(actual[i]-expected[i]);pixels++;brightness+=actual[i];}
    samples.push(brightness);
   }
   const energy=[];
   for(const t of [0.4,1.5,10.5]) {
    const sample=await sounds.getSample(t);const b=sample.toAudioBuffer();sample.close();const data=b.getChannelData(0);
    energy.push(Math.sqrt(data.reduce((n:number,x:number)=>n+x*x,0)/data.length));
   }
   let frameCount=0;const packets=await load('/tests/browser-tools.ts');
   const videoSink=new packets.VideoSampleSink(v);
   for await (const sample of videoSink.samples()) {frameCount++;sample.close();}
   const ctx=new AudioContext({sampleRate:48000});const decodedAudio=await ctx.decodeAudioData(await blob.arrayBuffer());await ctx.close();const channel=decodedAudio.getChannelData(0);let onset=0;while(onset<channel.length&&Math.abs(channel[onset])<0.001)onset++;
   return {audioOnsetSeconds:onset/48000,videoDuration:await v.computeDuration(),audioDuration:await a.computeDuration(),duration:await input.computeDuration(),videoCodec:v.codec,audioCodec:a.codec,width:v.displayWidth,height:v.displayHeight,frameCount,meanPixelError:difference/pixels,samples,audioRms:energy};
  }finally{input.dispose();}
 },{moduleImport});
 expect(Math.abs(result.duration-12)).toBeLessThan(0.1);expect(result.videoCodec).toBe('vp8');expect(result.audioCodec).toBe('opus');
 expect(result.width).toBe(1280);expect(result.height).toBe(720);expect(result.frameCount).toBe(360);
 expect(result.meanPixelError).toBeLessThan(12);expect(new Set(result.samples).size).toBe(5);
 expect(result.audioOnsetSeconds).toBeGreaterThanOrEqual(0.99);expect(result.audioOnsetSeconds).toBeLessThan(1.1);
 const configured=await page.evaluate(()=>({video:(window as any).__configuredVideo,audio:(window as any).__configuredAudio}));expect(configured.video.length).toBeGreaterThan(0);expect(new Set(configured.video)).toEqual(new Set(['vp8']));expect(new Set(configured.audio)).toEqual(new Set(['opus']));
 expect(result.audioRms[0]).toBeLessThan(0.0001);expect(result.audioRms[1]).toBeGreaterThan(0.001);expect(result.audioRms[2]).toBeGreaterThan(0.001);
 expect(errors).toEqual([]);
 await writeFile('docs/browser-verification.json',JSON.stringify({...result,configuredEncoders:configured},null,2)+'\n');
});
test('export without audio, unsupported codec, cancellation and invalid project',async({page})=>{
 await page.goto('/?sample=demo');
 const results=await page.evaluate(async({moduleImport})=>{
  const load=eval(moduleImport);const {demo}=await load('/tests/browser-tools.ts');const {exportWebm}=await load('/tests/browser-tools.ts');
  const p={...demo,audio:null,slides:[{...demo.slides[0],duration:1}]};
  const blob=await exportWebm(p,()=>{});
  const {Input,BlobSource,WEBM}=await load('/tests/browser-tools.ts');const input=new Input({source:new BlobSource(blob),formats:[WEBM]});
  const silent={audio:await input.getPrimaryAudioTrack(),duration:await input.computeDuration()};input.dispose();
  const controller=new AbortController();let cancelled=false;
  try{await exportWebm(p,(v:number)=>{if(v>0)controller.abort();},controller.signal);}catch(e){cancelled=(e as Error).name==='AbortError';}
  const original=(window as any).VideoEncoder;let unsupported=false;
  try{(window as any).VideoEncoder=undefined;await exportWebm(p,()=>{});}catch{unsupported=true;}finally{(window as any).VideoEncoder=original;}
  return {silent,cancelled,unsupported};
 },{moduleImport});
 expect(results.silent.audio).toBeNull();expect(results.silent.duration).toBeCloseTo(1,2);expect(results.cancelled).toBe(true);expect(results.unsupported).toBe(true);
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"slides":[]}')});
 await expect(page.getByRole('status')).toContainText('読み込みできません');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
// The app only corrects captions: motion, parts, slides, images and audio come from the AI assistant's project.
test('only captions can be edited, and a whole long PDF project opens as one flow',async({page})=>{
 await page.goto('/?sample=demo');await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const fields=await page.locator('main input:not([type=file]),main textarea,main select').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
 // Besides the captions, only the player's own position and volume can be set.
 expect(fields.filter(f=>f!=='プレビューの再生位置'&&f!=='音量').every(f=>/^字幕/.test(f!))).toBe(true);
 for(const label of ['タイトル','表示時間','切り替え','表示方法','動き','画像を選ぶ','音声を選ぶ','PDFを読み込む','プロジェクト名'])await expect(page.getByLabel(label,{exact:true})).toHaveCount(0);
 for(const name of ['＋ スライドを追加','削除','PDFを保存'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'要素ごとの動き'})).toHaveCount(0);
 // 40 slides of 20 seconds (over ten minutes) is one valid project.
 const long=await page.evaluate(async()=>{const {validateProject,demo,totalFrames,FPS}=await import('/src/model.ts');const s=demo.slides[0];const p=validateProject({...demo,audio:null,slides:Array.from({length:40},(_,i)=>({...s,id:`s${i}`,duration:20}))});return totalFrames(p)/FPS;});
 expect(long).toBe(800);
 const big=Array.from({length:40},(_,i)=>({id:`s${i}`,eyebrow:'',title:`ページ ${i+1}`,body:'',duration:20,color:'#bce798',transition:'fade',image:null,captions:[{start:.3,duration:3,text:`${i+1}枚目の字幕。`}]}));
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'long.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,name:'長い資料',slides:big,audio:null}))});
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await expect(page.getByRole('heading',{name:'長い資料',exact:true})).toBeVisible();await expect(page.getByText('40枚 · 13分20秒')).toBeVisible();
 await page.getByRole('button',{name:'スライド 40',exact:true}).click();await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveValue('40枚目の字幕。');
}); 
test('preview plays, pauses and seeks with the independent audio clock',async({page})=>{
 await page.goto('/?sample=demo');await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const seek=page.getByLabel('プレビューの再生位置',{exact:true});
 await page.getByRole('button',{name:'プレビューを再生',exact:true}).click();
 await expect(page.getByRole('button',{name:'プレビューを一時停止',exact:true})).toBeVisible();
 await expect.poll(async()=>Number(await seek.inputValue())).toBeGreaterThan(30);
 await page.getByRole('button',{name:'プレビューを一時停止',exact:true}).click();
 const stopped=await seek.inputValue();
 await expect(page.getByRole('button',{name:'プレビューを再生',exact:true})).toBeVisible();
 expect(await seek.inputValue()).toBe(stopped);
 await seek.press('Home');await expect(seek).toHaveValue('0');
 await seek.press('ArrowRight');await expect(seek).toHaveValue('1');
 await page.getByRole('button',{name:'スライド 2',exact:true}).click();await expect(seek).toHaveValue('144');
 // Paging: 前へ/次へ, ← → keys outside the inputs, and the selection follows the seek bar.
 const current=page.locator('.slides [aria-current=true]');
 await page.getByRole('button',{name:'次のスライド',exact:true}).click();await expect(seek).toHaveValue('264');await expect(current).toHaveAccessibleName('スライド 3');
 await expect(page.getByRole('button',{name:'次のスライド',exact:true})).toBeDisabled();await expect(page.locator('.pager-position')).toContainText('3 / 3枚');
 await page.locator('header').click();await page.keyboard.press('ArrowLeft');await expect(seek).toHaveValue('144');await expect(current).toHaveAccessibleName('スライド 2');
 await page.getByLabel('字幕の一括入力',{exact:true}).press('ArrowLeft');await expect(current).toHaveAccessibleName('スライド 2');
 await seek.fill('20');await expect(current).toHaveAccessibleName('スライド 1');await expect(page.getByRole('button',{name:'前のスライド',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>window.scrollY)).toBe(0);
});
test('WAV parser rejects MPEG and compressed or malformed WAV before any codec decoder',async({page})=>{
 await page.goto('/?sample=demo');
 const parsed=await page.evaluate(async({moduleImport})=>{
  const load=eval(moduleImport);const {parsePcmWav,exportWebm,demo}=await load('/tests/browser-tools.ts');
  const original=await(await fetch('/demo.wav')).arrayBuffer();
  const valid=parsePcmWav(original);
  const errors=[];
  for(const bytes of [new TextEncoder().encode('ID3'+ 'a'.repeat(70)).buffer,original.slice(0,25),original.slice(0),original.slice(0)]){
   if(bytes.byteLength===original.byteLength){const view=new DataView(bytes);view.setUint16(20,errors.length===2?0x55:0x160,true);}
   try{parsePcmWav(bytes);errors.push(false);}catch{errors.push(true);}
  }
  let decodeCalls=0;const old=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=function(){decodeCalls++;throw new Error('Should not call compressed-audio decoder');};
  let exported=false;try{await exportWebm({...demo,slides:[{...demo.slides[0],duration:1}]},()=>{});exported=true;}finally{AudioContext.prototype.decodeAudioData=old;}
  return{duration:valid.duration,errors,decodeCalls,exported};
 },{moduleImport});
 expect(parsed.duration).toBe(12);expect(parsed.errors).toEqual([true,true,true,true]);expect(parsed.decodeCalls).toBe(0);expect(parsed.exported).toBe(true);
 const fake=Buffer.alloc(64);fake.write('ID3');
 const validProject=JSON.parse(await readFile('tests/fixtures/coffee-break-project.json','utf8'));
 validProject.audio.src='data:audio/wav;base64,'+fake.toString('base64');
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'fake-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(validProject))});
 await expect(page.getByRole('status')).toContainText('読み込みできません');
});
test('notices, corresponding MPL source and the distribution are accessible',async({page,request})=>{
 await page.goto('/?sample=demo');await page.getByRole('button',{name:'ライセンス・使用条件',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Mediabunny 1.62.1');
 const notice=await request.get('/licenses/THIRD_PARTY_NOTICES.md');expect(notice.ok()).toBe(true);expect(await notice.text()).toContain('MPL-2.0');
 const source=await request.get('/licenses/source/mediabunny-1.62.1/src/index.ts');expect(source.ok()).toBe(true);expect(await source.text()).toContain('export');
 const licenses=await(await request.get('/licenses/dependency-licenses.json')).json();
 expect(licenses.some((p:any)=>p.name==='mediabunny'&&p.license==='MPL-2.0')).toBe(true);
 expect(licenses.some((p:any)=>/remotion|ffmpeg|hyperframes/.test(p.name))).toBe(false);
 await page.getByRole('button',{name:'閉じる',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
});
