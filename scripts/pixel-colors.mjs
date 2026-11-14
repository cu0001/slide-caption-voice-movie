// Reads the colour of a slide image at given points, for the `key` colours in elements.json.
// Usage: npm run colors -- <project.json> <slide number> <x,y> [<x,y> …]   (x and y from 0 to 1, as on the grid images)
// A PDF page that is not 16:9 sits in the 1280×720 frame with margins, so a grid position is converted to a position
// on the page, the same way elements:build converts a part's box.
// The image is decoded by Chrome's canvas, so no image library beyond the app's own setup is needed.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {withApp} from './app-session.mjs';
const [input,slide,...points]=process.argv.slice(2);
if(!input||!slide||!points.length){console.error('Usage: npm run colors -- <project.json> <スライド番号> <x,y> [<x,y> …]');process.exit(1);}
const project=JSON.parse(readFileSync(resolve(input),'utf8')),target=project.slides?.[Number(slide)-1],image=target?.image;
if(!image){console.error(`スライド ${slide} に画像がありません。`);process.exit(1);}
const at=points.map(p=>{const [x,y]=p.split(',').map(Number);if(!(x>=0&&x<=1&&y>=0&&y<=1))throw new Error(`位置は0〜1で書いてください: ${p}`);return [x,y];});
// Only whole pages (and pages rebuilt as parts) are shown letterboxed; the built-in split layout crops its picture.
const framed=target.layout==='page'||target.layout==='layers';
const colors=await withApp(page=>page.evaluate(async([src,at,framed])=>{
 const img=new Image();img.src=src;await img.decode();
 const W=img.naturalWidth,H=img.naturalHeight,fit=Math.min(1280/W,720/H),ox=(1280-W*fit)/2,oy=(720-H*fit)/2;
 const canvas=Object.assign(document.createElement('canvas'),{width:W,height:H}),c=canvas.getContext('2d');c.drawImage(img,0,0);
 return at.map(([gx,gy])=>{
  const x=framed?(gx*1280-ox)/(W*fit):gx,y=framed?(gy*720-oy)/(H*fit):gy;
  if(!(x>=0&&x<=1&&y>=0&&y<=1))return null;
  const d=c.getImageData(Math.min(canvas.width-1,Math.floor(x*canvas.width)),Math.min(canvas.height-1,Math.floor(y*canvas.height)),1,1).data;
  return '#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join('');});
},[image,at,framed]));
points.forEach((p,i)=>console.log(p,colors[i]??'ページの外（余白）です'));
