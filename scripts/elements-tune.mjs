// Changes how named elements move in a project, as asked of the AI assistant ("make the sun come in slower").
// Usage: npm run elements:tune -- <project.json> <changes.json> [out.json]
// changes.json: {"slides":[{"index":2,"parts":{"太陽":{"enter":1.2,"animation":"drop"},"見出し":{"start":0.6}}}]}
// "id" may replace "index". Only motion fields change; position, look and the slide length stay as they are.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateProject,ELEMENT_ANIMATIONS,ELEMENT_EXITS,ELEMENT_LOOPS} from '../src/model.ts';
import {applyCues} from '../src/captions.ts';
const [input,changeFile,output=input]=process.argv.slice(2);
if(!input||!changeFile){console.error('Usage: npm run elements:tune -- <project.json> <changes.json> [out.json]');process.exit(1);}
const project=JSON.parse(readFileSync(resolve(input),'utf8')),plan=JSON.parse(readFileSync(resolve(changeFile),'utf8'));
if(!Array.isArray(plan.slides))throw new Error('changes.json には slides の配列が必要です。');
const FIELDS=['animation','start','enter','distance','loop','exit','exitDuration','cue','cueOffset'];
const LABEL={animation:'登場',start:'登場時刻',enter:'登場の秒数',distance:'移動の大きさ',loop:'表示中の動き',exit:'退場',exitDuration:'退場の秒数',cue:'合図の字幕',cueOffset:'合図からのずれ'};
const DEFAULT={enter:.7,distance:140,loop:'none',exit:'none',exitDuration:.5,cue:'なし',cueOffset:-.2};
const report=[];
for(const entry of plan.slides){
 const n=entry.id!==undefined?project.slides.findIndex(s=>s.id===entry.id)+1:entry.index;
 const slide=project.slides[n-1];
 if(!slide)throw new Error(`スライド ${entry.id??entry.index} が見つかりません。`);
 if(slide.layout!=='layers')throw new Error(`スライド ${n}: 要素ごとに動くスライドではありません（PDFページのカメラの動きは captions:apply の motion で変えます）。`);
 if(typeof entry.parts!=='object'||entry.parts===null)throw new Error(`スライド ${n}: parts に「要素名: 変更」を書いてください。`);
 for(const [name,change] of Object.entries(entry.parts)){
  const matches=slide.elements.filter(e=>e.name===name);
  if(matches.length!==1)throw new Error(`スライド ${n}: 要素「${name}」が${matches.length?'複数あります':'見つかりません'}。要素: ${slide.elements.map(e=>e.name).join('、')}`);
  const e=matches[0],unknown=Object.keys(change).filter(k=>!FIELDS.includes(k));
  if(unknown.length)throw new Error(`スライド ${n}「${name}」: 変えられるのは ${FIELDS.join('・')} だけです（${unknown.join('・')} は不可）。`);
  if(change.animation!==undefined&&!ELEMENT_ANIMATIONS.includes(change.animation))throw new Error(`スライド ${n}「${name}」: animation は ${ELEMENT_ANIMATIONS.join(' / ')} のどれかにしてください。`);
  if(e.type==='image'&&['lines','chars'].includes(change.animation))throw new Error(`スライド ${n}「${name}」: 画像の要素に lines・chars は使えません。`);
  if(change.exit!==undefined&&!ELEMENT_EXITS.includes(change.exit))throw new Error(`スライド ${n}「${name}」: exit の値が不正です。`);
  if(change.loop!==undefined&&!ELEMENT_LOOPS.includes(change.loop))throw new Error(`スライド ${n}「${name}」: loop の値が不正です。`);
  // cue: the caption number the part comes in with, or null to go back to its own start time.
  if(change.cue!==undefined&&change.cue!==null&&!(Number.isInteger(change.cue)&&change.cue>=1&&change.cue<=(slide.captions?.length??0)))throw new Error(`スライド ${n}「${name}」: cue は字幕の番号（1〜${slide.captions?.length??0}）か null にしてください。`);
  if(change.start!==undefined&&change.cue===undefined&&e.cue!==undefined)throw new Error(`スライド ${n}「${name}」: 字幕に合わせて出る部品です。時刻で決めるときは "cue": null も一緒に書いてください。`);
  const before=Object.fromEntries(Object.keys(change).map(k=>[k,e[k]??DEFAULT[k]]));
  // An element shown to the end of the slide keeps ending there when its start moves.
  const toEnd=e.start+e.duration>=slide.duration-.01;
  Object.assign(e,change);
  if(e.cue===null)delete e.cue;
  if(change.start!==undefined){
   if(!(typeof change.start==='number'&&change.start>=0&&change.start<slide.duration-.1))throw new Error(`スライド ${n}「${name}」: start は0以上、${(slide.duration-.1).toFixed(1)}秒未満にしてください。`);
   e.duration=Math.round((toEnd?slide.duration-e.start:Math.min(e.duration,slide.duration-e.start))*100)/100;
  }
  report.push(`スライド ${n}「${name}」: ${Object.keys(change).map(k=>`${LABEL[k]} ${before[k]} → ${change[k]??"なし"}`).join('、')}`);
 }
}
project.slides=project.slides.map(applyCues);
validateProject(project);
writeFileSync(resolve(output),JSON.stringify(project,null,2)+'\n');
console.log(report.join('\n')+`\n→ ${output}`);
