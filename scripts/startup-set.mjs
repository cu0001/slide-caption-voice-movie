// Makes the given project the one the app opens at startup: the whole PDF as one project, in one flow.
// Usage: npm run startup:set -- <project.json> [--source <元のファイル名>]
// Replaces everything in public/examples/startup/ with project.json and a startup.json describing it.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {resolve,basename,join} from 'node:path';
import {validateProject,totalFrames,FPS} from '../src/model.ts';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args.splice(i,2)[1];};
const source=option('--source');
if(args.length!==1){console.error('Usage: npm run startup:set -- <project.json> [--source <元のファイル名>]\n起動時に開くプロジェクトは1つです（パートに分けず、1本の流れにします）。');process.exit(1);}
// Validate before touching the folder, so a bad file leaves the current startup project in place.
const p=validateProject(JSON.parse(readFileSync(resolve(args[0]),'utf8')));
const dir=resolve('public/examples/startup');
mkdirSync(dir,{recursive:true});
for(const f of readdirSync(dir))rmSync(join(dir,f));
writeFileSync(join(dir,'project.json'),JSON.stringify(p,null,2)+'\n');
const info={source:source??basename(args[0]),file:'project.json',name:p.name,slides:p.slides.length,seconds:Math.round(totalFrames(p)/FPS*10)/10};
writeFileSync(join(dir,'startup.json'),JSON.stringify(info,null,2)+'\n');
console.log(`起動時: ${info.name}（${info.slides}枚・${info.seconds}秒）\n→ ${dir}`);
