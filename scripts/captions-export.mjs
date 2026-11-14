// Renders one still per slide (plus a gridded copy for choosing camera focus) and its text, so an AI assistant can read the slides before writing captions.
// Usage: npm run captions:export -- <project.json> [outDir]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {withApp} from './app-session.mjs';
const [input,outDir='captions-work']=process.argv.slice(2);
if(!input){console.error('Usage: npm run captions:export -- <project.json> [outDir]');process.exit(1);}
const project=JSON.parse(readFileSync(resolve(input),'utf8'));
mkdirSync(outDir,{recursive:true});
await withApp(async page=>{
 const stills=await page.evaluate(async p=>{
  const {validateProject,frames}=await import('/src/model.ts'),{loadAssets,drawFrame}=await import('/src/render.ts');
  // Captions are left out of the stills so the assistant judges the slide itself; PDF pages are shown whole, without camera motion.
  const clean=validateProject({...p,slides:p.slides.map(s=>({...s,captions:undefined,...(s.layout==='page'?{motion:'none'}:{})}))}),assets=await loadAssets(clean);
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  let offset=0;
  return clean.slides.map(s=>{
   // Pick the moment every element has entered but none has started to leave.
   let t=s.duration*.6;
   if(s.layout==='layers'&&s.elements?.length){
    const entered=Math.max(...s.elements.map(e=>e.start+(e.enter??.7))),leaving=Math.min(s.duration,...s.elements.filter(e=>e.exit&&e.exit!=='none').map(e=>e.start+e.duration-(e.exitDuration??.5)));
    t=Math.max(0,Math.min(entered+.3,leaving-.05,s.duration-.1));
   }
   const local=Math.min(frames(s)-1,Math.round(t*30));drawFrame(canvas,clean,offset+local,assets);offset+=frames(s);
   const image=canvas.toDataURL('image/png');
   // Same still with a 10% grid, so the assistant can read focus positions (0–1) for camera motion.
   const c=canvas.getContext('2d');c.save();c.fillStyle='rgba(255,60,60,.16)';c.fillRect(0,720*.8,1280,720*.2);
   c.strokeStyle='rgba(255,60,60,.75)';c.lineWidth=1;c.font='600 15px sans-serif';c.fillStyle='#ff3c3c';
   for(let k=1;k<10;k++){const x=1280*k/10,y=720*k/10;c.beginPath();c.moveTo(x,0);c.lineTo(x,720);c.moveTo(0,y);c.lineTo(1280,y);c.stroke();c.fillText(`x${k/10}`,x+3,16);c.fillText(`y${k/10}`,3,y-4);}
   c.fillText('字幕の帯（y0.8より下）',1280*.4,720*.8+20);c.restore();
   return {image,grid:canvas.toDataURL('image/png'),at:local/30};
  });
 },project);
 const slides=project.slides.map((s,i)=>{
  const file=`slide-${String(i+1).padStart(2,'0')}.png`;
  const grid=file.replace('.png','-grid.png');
  writeFileSync(join(outDir,file),Buffer.from(stills[i].image.split(',')[1],'base64'));writeFileSync(join(outDir,grid),Buffer.from(stills[i].grid.split(',')[1],'base64'));
  return {index:i+1,id:s.id,image:file,grid,stillAtSeconds:stills[i].at,duration:s.duration,layout:s.layout??'split',...(s.layout==='page'?{motion:{type:s.motion??'zoom-in',amount:s.motionAmount??.85,focusX:s.focusX??.5,focusY:s.focusY??.5}}:{}),eyebrow:s.eyebrow,title:s.title,body:s.body,
   elementTexts:(s.elements??[]).filter(e=>e.type==='text').map(e=>({name:e.name,text:e.text})),captions:(s.captions??[]).map(c=>c.text)};
 });
 writeFileSync(join(outDir,'slides.json'),JSON.stringify({project:project.name,slides},null,2)+'\n');
 console.log(`Wrote ${slides.length} slide images and slides.json to ${outDir}/`);
});
