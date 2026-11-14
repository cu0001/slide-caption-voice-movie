// Lets the app's 音声生成 button run voice/narrate.js. Irodori's address and credentials stay on this machine: the browser
// only talks to the Vite dev server, so the routes exist under `vite` alone and a built site shows no button.
//   GET  /api/voice/status    → {speed}
//   POST /api/voice/generate  {project,speed} → NDJSON: {type:'progress',done,total,slide,caption}…, then {type:'done',project,report,summary} or {type:'error',message}
// Lines are cached in output/<project name>/work/voice/, the folder the skill uses, so finished lines are never asked for twice.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {validateProject} from '../src/model.ts';
import {readIrodoriConfig} from './irodori.js';
import {createGoogleAuth} from './googleAuth.js';
import {createReadings} from './readings.js';
import {narrate} from './narrate.js';
const LIMIT=200*1024*1024;
// .env.local is read per request so edits apply without a restart. As with the command, the shell's values win.
function environment(){try{return{...parseEnv(readFileSync('.env.local','utf8')),...process.env};}catch{return process.env;}}
const cacheFor=name=>process.env.VOICE_CACHE_DIR?resolve(process.env.VOICE_CACHE_DIR):resolve('output',String(name).replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,80)||'project','work','voice');
class Refused extends Error{constructor(status,message){super(message);this.status=status;}}
// Any web page can POST to localhost, and each line costs a TTS call: only the app's own page may start a run.
function sameOrigin(req){try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}}
function readBody(req){
 return new Promise((ok,no)=>{
  let chunks=[],size=0;
  req.on('data',c=>{if(!chunks)return;size+=c.length;if(size>LIMIT){chunks=null;no(new Refused(413,'プロジェクトは200MB以内で指定してください。'));}else chunks.push(c);});
  req.on('end',()=>{if(chunks)ok(Buffer.concat(chunks).toString('utf8'));});
  req.on('error',no);
 });
}
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
export function voiceServer(){
 let running=false;
 return{name:'voice-server',apply:'serve',configureServer(server){
  server.middlewares.use('/api/voice',async(req,res,next)=>{
   if(req.method==='GET'&&req.url==='/status'){
    let speed=1;try{speed=readIrodoriConfig(environment()).speed;}catch{/* a bad IRODORI_SPEED is reported when generating */}
    return reply(res,200,{speed});
   }
   if(req.method!=='POST'||req.url!=='/generate')return next();
   if(!sameOrigin(req))return reply(res,403,{message:'このページからは音声を作れません。'});
   if(!req.headers['content-type']?.startsWith('application/json'))return reply(res,415,{message:'JSONで送ってください。'});
   if(running)return reply(res,409,{message:'別の音声生成が動いています。終わってからもう一度押してください。'});
   running=true;
   const controller=new AbortController();
   res.on('close',()=>{if(!res.writableFinished)controller.abort();});
   let started=false;
   const send=value=>res.write(JSON.stringify(value)+'\n');
   try{
    let body;try{body=JSON.parse(await readBody(req));}catch(e){throw e instanceof Refused?e:new Refused(400,'プロジェクトを読み取れません。');}
    let project;try{project=validateProject(body.project);}catch(e){throw new Refused(400,e.message);}
    const env=environment(),config=readIrodoriConfig(env);
    if(body.speed!==undefined){if(!(typeof body.speed==='number'&&body.speed>=.5&&body.speed<=2))throw new Refused(400,'話す速さは0.5〜2.0で指定してください。');config.speed=body.speed;}
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});started=true;
    const result=await narrate(project,{config,auth:createGoogleAuth({env}),readings:createReadings(),cache:cacheFor(project.name),signal:controller.signal,
     onProgress:({done,total,slide,caption})=>send({type:'progress',done,total,slide,caption})});
    send({type:'done',project:result.project,report:result.report,summary:result.summary});res.end();
   }catch(e){
    if(controller.signal.aborted)return;
    if(started){send({type:'error',message:e.message});res.end();}
    else reply(res,e.status??500,{message:e.message});
   }finally{running=false;}
  });
 }};
}
