// Deterministic sample inputs for the app and tests; never touches the user's startup project.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {withApp} from './app-session.mjs';
import {validateProject} from '../src/model.ts';
const folder='public/examples';
mkdirSync(folder,{recursive:true});
const coffee=JSON.parse(readFileSync('tests/fixtures/coffee-break-project.json','utf8'));
const lines=['湯気の立つ白いカップに、淹れたてのコーヒー。','窓辺の光を眺めながら、ゆっくりひと息つきます。','机の上のノートに、次のアイデアを書き留めます。'];
function save(name,p){writeFileSync(`${folder}/${name}-project.json`,JSON.stringify(validateProject(p),null,2)+'\n');}
save('coffee-captions',{...coffee,name:'ひと息のコーヒー時間｜字幕付き（無音）',audio:null,slides:coffee.slides.map((s,i)=>({...s,duration:9.5,captions:[{text:lines[i],start:.3,duration:8.7}]}))});
save('coffee-break-captions',{...coffee,slides:coffee.slides.map((s,i)=>({...s,captions:[{text:lines[i],start:.3,duration:3.2}]}))});
execFileSync('python3',['scripts/generate-element-sample.py'],{stdio:'inherit'});
const pdf=readFileSync('user-test/coffee-break.pdf').toString('base64');
const project=await withApp(page=>page.evaluate(async({pdf,audio})=>{
 const {importPdf}=await import('/src/pdf.ts');
 const p=await importPdf(new File([Uint8Array.from(atob(pdf),c=>c.charCodeAt(0))],'coffee-break.pdf',{type:'application/pdf'}),()=>{});
 return {...p,name:'ひと息のコーヒー時間｜PDFモーション',audio,slides:p.slides.map(s=>({...s,duration:4}))};
},{pdf,audio:coffee.audio}));
save('coffee-pdf',project);
console.log('サンプルプロジェクトを準備しました。');
