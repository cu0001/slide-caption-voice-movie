// Writes a project's WebM with the same exporter as the app's 「WebMを書き出す」.
// Usage: npm run video:export -- <project.json> <output.webm>
import {readFileSync,openSync,writeSync,closeSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {withApp} from './app-session.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output){console.error('Usage: npm run video:export -- <project.json> <output.webm>');process.exit(1);}
const project=JSON.parse(readFileSync(resolve(input),'utf8'));
// A whole PDF can run past ten minutes (~100MB of WebM), so the result is kept in the page and read back in pieces.
const CHUNK=8*1024*1024;
mkdirSync(dirname(resolve(output)),{recursive:true});
const seconds=await withApp(async page=>{
 let shown=-1;
 await page.exposeFunction('__progress',value=>{const step=Math.floor(value*10);if(step>shown){shown=step;process.stdout.write(`\r書き出し中 ${step*10}%`);}});
 const result=await page.evaluate(async p=>{
  const {validateProject,totalFrames,FPS}=await import('/src/model.ts'),{exportWebm}=await import('/src/export.ts');
  const blob=await exportWebm(validateProject(p),v=>window.__progress(v));
  window.__webm=blob;return {size:blob.size,seconds:totalFrames(p)/FPS};
 },project);
 process.stdout.write('\n');
 const fd=openSync(resolve(output),'w');
 try{
  for(let at=0;at<result.size;at+=CHUNK){
   const data=await page.evaluate(async([at,size])=>{
    const bytes=new Uint8Array(await window.__webm.slice(at,at+size).arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return btoa(binary);
   },[at,CHUNK]);
   writeSync(fd,Buffer.from(data,'base64'));
  }
 }finally{closeSync(fd);}
 return result.seconds;
});
console.log(`WebM ${seconds.toFixed(1)}秒（${project.audio?'VP8/Opus':'VP8・音声なし'}） → ${output}`);
