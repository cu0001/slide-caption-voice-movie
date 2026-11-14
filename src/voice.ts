import type {Project} from './model';
// The 音声生成 button's connection to the dev server (voice/devServer.js). The browser never talks to Irodori itself.
/** Null when no dev server is behind the page (a built site answers with index.html or 404): the button is then hidden. */
export async function voiceStatus():Promise<{speed:number}|null>{
 try{
  const r=await fetch('/api/voice/status');
  return r.ok&&r.headers.get('content-type')?.includes('application/json')?await r.json():null;
 }catch{return null;}
}
/** The line being read: `slide` and `caption` count from 1, `done` of `total` lines are finished. */
export type VoiceProgress={slide:number;caption:number;done:number;total:number};
export async function generateVoice(project:Project,speed:number,onProgress:(line:VoiceProgress)=>void,signal:AbortSignal){
 const r=await fetch('/api/voice/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project,speed}),signal});
 if(!r.ok||!r.body){const failure=await r.json().catch(()=>null) as {message?:string}|null;throw new Error(failure?.message??`音声を作れませんでした（${r.status}）。`);}
 const reader=r.body.pipeThrough(new TextDecoderStream()).getReader();
 let buffer='';
 for(;;){
  const {value,done}=await reader.read();
  if(done)throw new Error('音声の作成が途中で止まりました。開発サーバーのログを確かめてください。');
  buffer+=value;
  const lines=buffer.split('\n');buffer=lines.pop()!;
  for(const line of lines){
   const event=JSON.parse(line);
   if(event.type==='progress')onProgress(event);
   else if(event.type==='error')throw new Error(event.message);
   else if(event.type==='done')return event as {project:Project;report:string[];summary:string};
  }
 }
}
