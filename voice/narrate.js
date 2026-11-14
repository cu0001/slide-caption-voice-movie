// Reads every caption aloud with Irodori-TTS, times the captions to the voice and puts the narration in the project.
// Used by both `npm run voice:generate` and the app's 音声生成 button (voice/devServer.js).
// Each caption is one spoken line: it is on screen exactly while it is said. Parts with "cue" move with their caption.
// Spoken lines are kept in `cache` by text, reading, voice and speed, so a second run only asks Irodori for what changed.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {timeVoice,withDuration,applyCues} from '../src/captions.ts';
import {validateProject,totalFrames,FPS} from '../src/model.ts';
import {synthesize} from './irodori.js';
import {pcm} from './speechWav.js';
// What the app can play and export (src/audio.ts): the narration is one WAV for the whole video, so a narrated
// project stops here although a silent one may run to 60 minutes.
const MAX_VOICE_SECONDS=20*60,MAX_VOICE_BYTES=64*1024*1024;
const tooLong=seconds=>new Error(`ナレーション付きの動画は20分以内にしてください（${Math.floor(seconds/60)}分${Math.round(seconds%60)}秒を超えます）。字幕を減らすか短くしてください。ここまでに作った音声は残るので、作り直しにはなりません。`);
// Halves the sample rate of 16-bit PCM: a windowed-sinc low-pass below the new Nyquist, then every other sample.
function halve(format,data){
 const channels=format.readUInt16LE(2),frames=data.length/2/channels,out=Buffer.alloc(Math.floor(frames/2)*2*channels),M=24;
 const taps=Array.from({length:2*M+1},(_,k)=>{const x=k-M,fc=.23;return(x?Math.sin(2*Math.PI*fc*x)/(Math.PI*x):2*fc)*(.5+.5*Math.cos(Math.PI*x/(M+1)));});
 const sum=taps.reduce((a,b)=>a+b,0);
 for(let ch=0;ch<channels;ch++)for(let i=0;i<frames/2-.5;i++){
  let v=0;const c=2*i;
  for(let k=-M;k<=M;k++){const j=c+k;if(j>=0&&j<frames)v+=data.readInt16LE((j*channels+ch)*2)*taps[k+M];}
  out.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(v/sum))),(i*channels+ch)*2);
 }
 const f=Buffer.from(format);f.writeUInt32LE(format.readUInt32LE(4)/2,4);f.writeUInt32LE(format.readUInt32LE(8)/2,8);
 return[f,out];
}
/** Changes `project` in place and returns it with a report. `onProgress` gets each line as it starts; `signal` stops between lines. */
export async function narrate(project,{config,auth,readings,cache,onProgress=()=>{},signal}){
 mkdirSync(cache,{recursive:true});
 let made=0,reused=0;
 async function speak(text){
  const key=createHash('sha256').update(JSON.stringify({url:config.url,voice:config.voice,caption:config.caption,speed:config.speed,input:readings(text)})).digest('hex').slice(0,24);
  const file=join(cache,`${key}.wav`);
  if(existsSync(file)){reused++;return readFileSync(file);}
  const result=await synthesize(config,text,auth,readings,signal);
  if(!result.audio)throw new Error(`音声を作れませんでした（「${text.slice(0,20)}…」）: ${result.message}`);
  writeFileSync(file,result.audio);made++;return result.audio;
 }
 const total=project.slides.reduce((n,s)=>n+(s.captions?.length??0),0);
 const report=[],placed=[];
 let format,offset=0,done=0;
 for(const [i,s] of project.slides.entries()){
  const n=i+1,captions=s.captions??[];
  if(!captions.length){const {voice,...rest}=s;project.slides[i]=rest;report.push(`スライド ${n}: 字幕なし（音声なし、${s.duration}秒）`);offset+=s.duration;if(offset>MAX_VOICE_SECONDS)throw tooLong(offset);continue;}
  const clips=[];
  for(const [k,c] of captions.entries()){
   signal?.throwIfAborted();
   onProgress({slide:n,slides:project.slides.length,caption:k+1,captions:captions.length,done:done++,total});
   const {format:f,data}=pcm(await speak(c.text));
   if(format&&!format.equals(f))throw new Error('音声の形式（サンプリングレート・チャンネル数）が途中で変わりました。キャッシュを消して作り直してください。');
   format=f;clips.push(data);
  }
  const rate=format.readUInt32LE(4),align=format.readUInt16LE(12);
  const seconds=clips.map(d=>d.length/align/rate);
  const before=s.duration,{captions:timed,duration}=timeVoice(s,seconds);
  const next=applyCues({...withDuration(s,duration),captions:timed,voice:{lines:captions.map(c=>c.text)}});
  project.slides[i]=next;
  timed.forEach((c,k)=>placed.push({at:offset+c.start,data:clips[k]}));
  const cued=(next.elements??[]).filter(e=>e.cue!==undefined).map(e=>`${e.name}→字幕${e.cue}（${e.start}秒）`);
  report.push(`スライド ${n}: 字幕 ${captions.length}個・読み上げ ${seconds.reduce((a,b)=>a+b,0).toFixed(1)}秒、表示時間 ${before}秒 → ${duration}秒${cued.length?`、合図で登場: ${cued.join('、')}`:''}`);
  offset+=duration;
  // Stop as soon as the limit is passed, not after every remaining line has been read.
  if(offset>MAX_VOICE_SECONDS)throw tooLong(offset);
 }
 if(!format)throw new Error('字幕が1つもないので、読み上げる文がありません。先に字幕を書き込んでください。');
 // One WAV for the whole video, in Irodori's own format: silence between the spoken lines, each at its caption's start.
 const rate=format.readUInt32LE(4),align=format.readUInt16LE(12),seconds=totalFrames(project)/FPS;
 const data=Buffer.alloc(Math.round(seconds*rate)*align);
 for(const p of placed){const at=Math.round(p.at*rate)*align;p.data.copy(data,at,0,Math.max(0,Math.min(p.data.length,data.length-at)));}
 // Irodori speaks at 48kHz; speech needs far less, and 24kHz keeps a 20-minute project's WAV near 58MB instead of 115MB.
 const [outFormat,outData]=rate>=44100&&rate%2===0&&format.readUInt16LE(14)===16?halve(format,data):[format,data];
 const wav=Buffer.alloc(20+outFormat.length+8+outData.length);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(outFormat.length,16);outFormat.copy(wav,20);
 wav.write('data',20+outFormat.length);wav.writeUInt32LE(outData.length,24+outFormat.length);outData.copy(wav,28+outFormat.length);
 if(wav.length>MAX_VOICE_BYTES)throw new Error(`ナレーションのWAVが${(wav.length/1048576).toFixed(0)}MBになり、上限の64MBを超えます。字幕を減らすか短くしてください。`);
 project.audio={src:'data:audio/wav;base64,'+wav.toString('base64'),name:`ナレーション（Irodori-TTS・${config.voice}）`,start:0,volume:1,speed:config.speed};
 validateProject(project);
 return {project,report,made,reused,seconds,summary:`音声 新規 ${made}・作成済み ${reused}、WAV ${outFormat.readUInt32LE(4)}Hz・${outFormat.readUInt16LE(2)}ch・${(wav.length/1048576).toFixed(1)}MB`};
}
