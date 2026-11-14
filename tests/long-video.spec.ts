import {test,expect} from '@playwright/test';
import {demo,validateProject,totalFrames,FPS,MAX_SECONDS} from '../src/model';

test('projects over 20 minutes and up to 60 minutes remain editable and saveable',async({page})=>{
 const slides=Array.from({length:60},(_,i)=>({...demo.slides[0],id:`long-${i}`,image:null,duration:60}));
 const project=validateProject({...demo,audio:null,slides});
 expect(MAX_SECONDS).toBe(3600);
 expect(totalFrames(project)/FPS).toBe(3600);
 await page.goto('/?sample=demo');
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'long.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await expect(page.locator('.meta')).toContainText('60分00秒');
 await page.getByRole('button',{name:'スライド 60',exact:true}).click();
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('最後のスライドの字幕です。');
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
 const saved=page.waitForEvent('download');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 const file=await saved;
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles((await file.path())!);
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await page.getByRole('button',{name:'スライド 60',exact:true}).click();
 await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveValue('最後のスライドの字幕です。');
});

test('a 20-minute-plus WebM exports with bounded audio buffers and a playable ending',async({page})=>{
 test.setTimeout(240000);
 await page.goto('/?sample=demo');
 const result=await page.evaluate(async()=>{
  const load=eval('(url)=>import(url)');
  const {exportWebm}=await load('/src/export.ts');
  const {Input,BlobSource,WEBM,CanvasSink,AudioSampleSink}=await load('/tests/browser-tools.ts');
  const {validateProject}=await load('/src/model.ts');
  const allocations:number[]=[];
  const Original=window.OfflineAudioContext;
  window.OfflineAudioContext=class extends Original {
   constructor(channels:number,length:number,rate:number){super(channels,length,rate);allocations.push(length);}
  } as typeof OfflineAudioContext;
  try{
   const p=validateProject({version:1,name:'20分超の書き出し',audio:null,slides:Array.from({length:21},(_,i)=>({id:`s${i}`,eyebrow:'',title:'',body:'',duration:i===20?1:60,color:'#ffffff',transition:'cut',image:null,layout:'layers',elements:[]}))});
   // Start a real WAV near the end; this also tests a delay greater than 20 minutes
   // without allocating PCM for the entire leading silence.
   p.audio={src:'/demo.wav',name:'test',start:1200.1,volume:.35};
   const blob=await exportWebm(p,()=>{});
   const input=new Input({source:new BlobSource(blob),formats:[WEBM]});
   try{
    const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack();
    const ending=await new CanvasSink(video).getCanvas(1200.8);
    const sink=new AudioSampleSink(audio);
    const energy=[];
    for(const t of [1199.8,1200.5]){
     const sample=await sink.getSample(t),buffer=sample.toAudioBuffer();sample.close();
     const data=buffer.getChannelData(0);
     energy.push(Math.sqrt(data.reduce((sum:number,x:number)=>sum+x*x,0)/data.length));
    }
    return {duration:await input.computeDuration(),videoDuration:await video.computeDuration(),audioDuration:await audio.computeDuration(),videoCodec:video.codec,audioCodec:audio.codec,ending:ending!==null,allocations,energy};
   }finally{input.dispose();}
  }finally{window.OfflineAudioContext=Original;}
 });
 expect(result.duration).toBeCloseTo(1201,0);
 expect(result.videoDuration).toBeCloseTo(1201,1);
 expect(result.audioDuration).toBeCloseTo(1201,0);
 expect(result.videoCodec).toBe('vp8');expect(result.audioCodec).toBe('opus');
 expect(result.ending).toBe(true);
 expect(result.allocations.length).toBeGreaterThan(0);
 expect(Math.max(...result.allocations)).toBeLessThanOrEqual(48000*5);
 expect(result.energy[0]).toBeLessThan(.0001);expect(result.energy[1]).toBeGreaterThan(.001);
});

test('WebM output spanning multiple 8 MB chunks keeps its duration and seek index',async({page})=>{
 await page.goto('/?sample=demo');
 const result=await page.evaluate(async()=>{
  const load=eval('(url)=>import(url)');
  const {exportWebm}=await load('/src/export.ts');
  const {demo,Input,BlobSource,WEBM,CanvasSink}=await load('/tests/browser-tools.ts');
  const project={...demo,audio:null,slides:Array.from({length:6},(_,i)=>({...demo.slides[i%3],id:`chunk-${i}`,duration:10}))};
  const blob=await exportWebm(project,()=>{});
  const input=new Input({source:new BlobSource(blob),formats:[WEBM]});
  try{
   const track=await input.getPrimaryVideoTrack();
   const end=await new CanvasSink(track).getCanvas(59.8);
   return {size:blob.size,duration:await input.computeDuration(),ending:end!==null};
  }finally{input.dispose();}
 });
 expect(result.size).toBeGreaterThan(8*1024*1024);
 expect(result.duration).toBeCloseTo(60,1);
 expect(result.ending).toBe(true);
});
