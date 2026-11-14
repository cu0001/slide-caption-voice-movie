// Checks an exported WebM with the app's own Mediabunny in Chrome: length, codecs, the audio track, and a few frames as PNG.
// Usage: npm run video:check -- <video.webm> [frames-dir]
// Frames are taken at 25% and 60% of the video and written as <name>-frame-<seconds>s.png (default: next to the video).
import {mkdirSync,writeFileSync,statSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';
import {withApp} from './app-session.mjs';
const [input,framesDir]=process.argv.slice(2);
if(!input){console.error('Usage: npm run video:check -- <video.webm> [frames-dir]');process.exit(1);}
const file=resolve(input),outDir=resolve(framesDir??dirname(file)),name=basename(file).replace(/\.webm$/i,'');
const result=await withApp(async page=>{
 // Served from Node so a large video does not pass through page.evaluate.
 await page.route('**/__video-check.webm',route=>route.fulfill({path:file,contentType:'video/webm'}));
 return await page.evaluate(async()=>{
  const {Input,BlobSource,ALL_FORMATS,CanvasSink}=await import('/@id/mediabunny');
  const input=new Input({source:new BlobSource(await (await fetch('/__video-check.webm')).blob()),formats:ALL_FORMATS});
  const video=await input.getPrimaryVideoTrack(),audio=await input.getPrimaryAudioTrack(),seconds=await input.computeDuration();
  const frames=[];
  if(video){
   const sink=new CanvasSink(video,{width:960,height:540,fit:'contain'});
   for(const at of [seconds*0.25,seconds*0.6]){
    const frame=await sink.getCanvas(at);if(!frame)continue;
    const canvas=frame.canvas instanceof HTMLCanvasElement?frame.canvas:Object.assign(document.createElement('canvas'),{width:960,height:540});
    if(canvas!==frame.canvas)canvas.getContext('2d').drawImage(frame.canvas,0,0);
    frames.push({at:Math.round(at*10)/10,png:canvas.toDataURL('image/png')});
   }
  }
  return {seconds,video:video?{codec:video.codec,width:await video.getDisplayWidth(),height:await video.getDisplayHeight()}:null,
   audio:audio?{codec:audio.codec,sampleRate:audio.sampleRate,channels:audio.numberOfChannels}:null,frames};
 });
});
mkdirSync(outDir,{recursive:true});
const written=result.frames.map(f=>{const p=join(outDir,`${name}-frame-${f.at}s.png`);writeFileSync(p,Buffer.from(f.png.split(',')[1],'base64'));return p;});
const mb=(statSync(file).size/1024/1024).toFixed(1);
console.log(`長さ ${result.seconds.toFixed(1)}秒・${mb}MB`);
console.log(`映像: ${result.video?`${result.video.codec} ${result.video.width}×${result.video.height}`:'なし'}`);
console.log(`音声: ${result.audio?`${result.audio.codec} ${result.audio.sampleRate}Hz・${result.audio.channels}ch`:'なし'}`);
for(const p of written)console.log(`コマ → ${p}`);
