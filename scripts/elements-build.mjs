// Rebuilds PDF page slides as separately animated parts, cut out of the page image by the boxes an AI assistant chose.
// Usage: npm run elements:build -- <project.json> <elements.json> [out.json] [--check <dir>]
// elements.json: {"slides":[{"id":"<slide id>","background":{"animation":"fade"},"parts":[{"name":"カップ","box":[0.62,0.38,0.92,0.75],"key":["#e7d6b8"],"animation":"pop","start":0.5,"loop":"sway"}]}]}
// "index" from 1 may replace "id". Pages not listed stay as whole pages with camera motion.
// --check writes, per rebuilt page, its background with the holes the parts leave (bg-01.png…) and an entrance strip at
// 0.3s, 0.8s, 1.5s and the settled moment (steps-01.png…).
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {withApp} from './app-session.mjs';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args.splice(i,2)[1];};
const checkDir=option('--check');
const [input,planFile,output=input]=args;
if(!input||!planFile){console.error('Usage: npm run elements:build -- <project.json> <elements.json> [out.json] [--check <dir>]');process.exit(1);}
const project=JSON.parse(readFileSync(resolve(input),'utf8')),plan=JSON.parse(readFileSync(resolve(planFile),'utf8'));
if(!Array.isArray(plan.slides))throw new Error('elements.json には slides の配列が必要です。');
const result=await withApp(page=>page.evaluate(async({p,plan})=>{
 const {validateProject}=await import('/src/model.ts'),{splitPage}=await import('/src/split.ts');
 const reports=[],slides=[];
 for(const [i,s] of p.slides.entries()){
  const entry=plan.slides.find(x=>x.id===s.id)??plan.slides.find(x=>x.id===undefined&&x.index===i+1);
  if(!entry){slides.push(s);reports.push(null);continue;}
  const {slide,report}=await splitPage(s,entry,i+1);slides.push(slide);reports.push(report);
 }
 const project=validateProject({...p,slides});
 // Entrance strip per rebuilt page (0.3s, 0.8s, 1.5s and once every part has arrived), captions left out.
 const {loadAssets,drawFrame}=await import('/src/render.ts'),{frames}=await import('/src/model.ts');
 const still=validateProject({...project,slides:project.slides.map(s=>({...s,captions:undefined,transition:'cut'}))}),assets=await loadAssets(still);
 const frame=document.createElement('canvas');frame.width=1280;frame.height=720;
 const strip=document.createElement('canvas');strip.width=1280*2;strip.height=720/2;const sc=strip.getContext('2d');
 let offset=0;
 for(const [i,s] of still.slides.entries()){
  if(reports[i]){
   const settled=Math.min(s.duration-.1,Math.max(...s.elements.map(e=>e.start+(e.enter??.7)))+.3);
   [.3,.8,1.5,settled].forEach((t,k)=>{drawFrame(frame,still,offset+Math.min(frames(s)-1,Math.round(t*30)),assets);sc.drawImage(frame,k*640,0,640,360);sc.fillStyle='#ff3c3c';sc.font='600 18px sans-serif';sc.fillText(`${t.toFixed(1)}s`,k*640+10,24);});
   reports[i].steps=strip.toDataURL('image/png');
  }
  offset+=frames(s);
 }
 return {project,reports};
},{p:project,plan}));
writeFileSync(resolve(output),JSON.stringify(result.project,null,2)+'\n');
if(checkDir)mkdirSync(checkDir,{recursive:true});
const lines=result.reports.map((r,i)=>{
 const n=i+1;if(!r)return `スライド ${n}: そのまま（PDFページ全体・カメラの動き）`;
 if(checkDir){
  writeFileSync(join(checkDir,`bg-${String(n).padStart(2,'0')}.png`),Buffer.from(r.background.split(',')[1],'base64'));
  writeFileSync(join(checkDir,`steps-${String(n).padStart(2,'0')}.png`),Buffer.from(r.steps.split(',')[1],'base64'));
 }
 const pct=(r.mismatch*100).toFixed(2);
 return `スライド ${n}: 部品 ${r.parts}個＋背景、元のページとの差 ${pct}%${r.mismatch>.003?'（0.3%超: 部品の色が背景に近すぎるか、box が足りない。tolerance・key・box を見直す）':''}`;
});
console.log(lines.join('\n')+`\n→ ${output}`);
