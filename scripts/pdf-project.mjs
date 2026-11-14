// Turns a PDF into a project JSON with the same import the app's 「PDFを読み込む」 uses.
// Usage: npm run pdf:project -- <input.pdf> <project.json> [--seconds 5] [--motion zoom-in|zoom-out|pan-left|pan-right|none]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {basename,dirname,resolve} from 'node:path';
import {withApp} from './app-session.mjs';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args.splice(i,2)[1];};
const seconds=option('--seconds'),motion=option('--motion');
const [input,output]=args;
if(!input||!output){console.error('Usage: npm run pdf:project -- <input.pdf> <project.json> [--seconds 5] [--motion zoom-in|zoom-out|pan-left|pan-right|none]');process.exit(1);}
if(seconds!==undefined&&!(Number(seconds)>=1&&Number(seconds)<=60))throw new Error('--seconds は1〜60で指定してください。');
if(motion!==undefined&&!['zoom-in','zoom-out','pan-left','pan-right','none'].includes(motion))throw new Error('--motion の値が不正です。');
const bytes=readFileSync(resolve(input));
const project=await withApp(page=>page.evaluate(async({data,name,seconds,motion})=>{
 const {importPdf}=await import('/src/pdf.ts'),{validateProject}=await import('/src/model.ts');
 const file=new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'application/pdf'});
 const p=await importPdf(file,()=>{});
 for(const s of p.slides){if(seconds)s.duration=seconds;if(motion)s.motion=motion;}
 return validateProject(p);
},{data:bytes.toString('base64'),name:basename(input),seconds:seconds&&Number(seconds),motion}));
mkdirSync(dirname(resolve(output)),{recursive:true});
writeFileSync(resolve(output),JSON.stringify(project,null,2)+'\n');
console.log(`PDF ${project.slides.length}ページ → ${output}`);
