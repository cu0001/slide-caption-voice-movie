// Writes captions (and, for PDF pages, camera motion) into a project, timing captions at reading speed and lengthening slides when needed.
// Usage: npm run captions:apply -- <project.json> <captions.json> [out.json]
// captions.json: {"slides":[{"id":"<slide id>","captions":["一文目","二文目"],"motion":{"type":"zoom-in","amount":0.6,"focusX":0.7,"focusY":0.4}}]}
// "index" from 1 may replace "id". "captions" and "motion" are each optional; "motion" applies to PDF page slides only.
// Parts with "cue" (elements.json) move to the start of their caption. To read the captions aloud, run voice:generate next.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {timeCaptions,withDuration,applyCues} from '../src/captions.ts';
import {validateProject,totalFrames,FPS} from '../src/model.ts';
const [input,captionFile,output=input]=process.argv.slice(2);
if(!input||!captionFile){console.error('Usage: npm run captions:apply -- <project.json> <captions.json> [out.json]');process.exit(1);}
const project=JSON.parse(readFileSync(resolve(input),'utf8')),plan=JSON.parse(readFileSync(resolve(captionFile),'utf8'));
if(!Array.isArray(plan.slides))throw new Error('captions.json には slides の配列が必要です。');
const MOTIONS={'zoom-in':'大きく寄る','zoom-out':'全体へ引く','pan-left':'左へ移動','pan-right':'右へ移動','none':'静止'};
const unit=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
function motionPatch(m,n){
 if(typeof m!=='object'||m===null||!(m.type in MOTIONS))throw new Error(`スライド ${n}: motion.type は ${Object.keys(MOTIONS).join(' / ')} のどれかにしてください。`);
 for(const key of ['amount','focusX','focusY'])if(m[key]!==undefined&&!unit(m[key]))throw new Error(`スライド ${n}: motion.${key} は0〜1の数で指定してください。`);
 return {motion:m.type,...(m.amount!==undefined?{motionAmount:m.amount}:{}),...(m.focusX!==undefined?{focusX:m.focusX}:{}),...(m.focusY!==undefined?{focusY:m.focusY}:{})};
}
const report=[];
project.slides=project.slides.map((s,i)=>{
 const n=i+1,entry=plan.slides.find(x=>x.id===s.id)??plan.slides.find(x=>x.id===undefined&&x.index===n);
 if(!entry)return s;
 const notes=[];let next=s;
 if(entry.motion!==undefined){
  const patch=motionPatch(entry.motion,n);
  if(s.layout==='page'){next={...next,...patch};notes.push(`動き ${MOTIONS[patch.motion]}（強さ${Math.round((patch.motionAmount??s.motionAmount??.85)*100)}%・注目 横${Math.round((patch.focusX??s.focusX??.5)*100)}% 縦${Math.round((patch.focusY??s.focusY??.5)*100)}%）`);}
  else notes.push('動きはPDFページ以外のため使わない');
 }
 if(entry.captions!==undefined){
  if(!Array.isArray(entry.captions)||entry.captions.some(t=>typeof t!=='string'))throw new Error(`スライド ${n}: captions は文字列の配列にしてください。`);
  // Too many, too long, or over 60 seconds: name the slide so the right captions get shortened.
  let timed;
  try{timed=timeCaptions(entry.captions,next.duration);}catch(e){throw new Error(`スライド ${n}: ${e.message}`);}
  const {captions,duration}=timed;
  notes.unshift(`字幕 ${captions.length}個${duration>next.duration?`、表示時間 ${next.duration}秒 → ${duration}秒`:''}`);
  // Captions timed at reading speed are not spoken: a slide read aloud before needs voice:generate again.
  const {voice,...rest}=duration>next.duration?withDuration(next,duration):next;
  next=applyCues({...rest,captions});
 }
 report.push(`スライド ${n}: ${notes.join('、')||'変更なし'}`);
 return next;
});
validateProject(project);
writeFileSync(resolve(output),JSON.stringify(project,null,2)+'\n');
console.log(report.join('\n')+`\n合計 ${(totalFrames(project)/FPS).toFixed(1)}秒 → ${output}`);
