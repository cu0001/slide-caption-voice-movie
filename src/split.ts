import {WIDTH,HEIGHT,ELEMENT_ANIMATIONS,ELEMENT_EXITS,ELEMENT_LOOPS,type Slide,type SceneElement,type ElementAnimation,type ElementExit,type ElementLoop} from './model';
// Splits a PDF page image into separately animated parts. Each part is a box on the page (read off the gridded
// 1280×720 still, so boxes are converted to page coordinates here). With "key" the part keeps only the pixels that
// differ from the surface colours behind it, and the hole it leaves below is filled from the nearest surface pixels,
// so the page looks whole before the part arrives. Without "key" the whole box moves and its hole is a flat colour.
export type Box=[number,number,number,number];
export type Timing={animation?:ElementAnimation;start?:number;enter?:number;distance?:number;exit?:ElementExit;exitDuration?:number;loop?:ElementLoop;cue?:number;cueOffset?:number};
export type Part=Timing&{name:string;box:Box;key?:boolean|string[];tolerance?:number;fill?:string|string[]};
export type PagePlan={background?:Timing;parts:Part[]};
export type SplitReport={parts:number;mismatch:number;background:string};
const TOLERANCE=40;
type RGB=[number,number,number];
const hex=(c:RGB)=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const parseHex=(s:string):RGB=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)) as RGB;
const isHex=(s:unknown)=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
function check(plan:PagePlan,n:number,duration:number){
 const fail=(s:string):never=>{throw new Error(`スライド ${n}: ${s}`);};
 if(!plan||!Array.isArray(plan.parts)||!plan.parts.length||plan.parts.length>39)fail('parts は1〜39個の配列にしてください。');
 const timing=(t:Timing,label:string)=>{
  if(t.animation!==undefined&&!ELEMENT_ANIMATIONS.includes(t.animation)||t.animation==='lines'||t.animation==='chars')fail(`${label}: animation は ${ELEMENT_ANIMATIONS.filter(a=>a!=='lines'&&a!=='chars').join(' / ')} のどれかにしてください（画像の部品なので lines・chars は使えません）。`);
  if(t.exit!==undefined&&!ELEMENT_EXITS.includes(t.exit))fail(`${label}: exit の値が不正です。`);
  if(t.loop!==undefined&&!ELEMENT_LOOPS.includes(t.loop))fail(`${label}: loop の値が不正です。`);
  if(t.start!==undefined&&!(t.start>=0&&t.start<duration-.1))fail(`${label}: start は0以上、スライドの長さ（${duration}秒）未満にしてください。`);
  if(t.cue!==undefined&&!(Number.isInteger(t.cue)&&t.cue>=1&&t.cue<=20)||t.cueOffset!==undefined&&!(t.cueOffset>=-3&&t.cueOffset<=3))fail(`${label}: cue は字幕の番号（1〜20）、cueOffset は-3〜3秒にしてください。`);
  if(t.enter!==undefined&&!(t.enter>=.1&&t.enter<=3)||t.exitDuration!==undefined&&!(t.exitDuration>=.1&&t.exitDuration<=3)||t.distance!==undefined&&!(t.distance>=0&&t.distance<=1000))fail(`${label}: enter・exitDuration は0.1〜3秒、distance は0〜1000にしてください。`);
 };
 if(plan.background)timing(plan.background,'background');
 plan.parts.forEach((p,i)=>{
  const label=`parts[${i}]「${p?.name}」`;
  if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>60)fail(`parts[${i}]: name（60字以内）が必要です。`);
  if(!Array.isArray(p.box)||p.box.length!==4||p.box.some(v=>typeof v!=='number'||!(v>=0&&v<=1))||p.box[0]>=p.box[2]||p.box[1]>=p.box[3])fail(`${label}: box は [左, 上, 右, 下] を0〜1で、左<右・上<下にしてください。`);
  if(p.key!==undefined&&typeof p.key!=='boolean'&&!(Array.isArray(p.key)&&p.key.length>=1&&p.key.length<=6&&p.key.every(isHex)))fail(`${label}: key は true/false か、"#rrggbb" の配列（1〜6色）にしてください。`);
  if(p.tolerance!==undefined&&!(typeof p.tolerance==='number'&&p.tolerance>=5&&p.tolerance<=150))fail(`${label}: tolerance は5〜150にしてください。`);
  if(p.key){
   const allowed=Array.isArray(p.key)?p.key.map(k=>k.toLowerCase()):[];
   if(p.fill!==undefined&&p.fill!=='auto'&&!(Array.isArray(p.key)&&[p.fill].flat().every(f=>typeof f==='string'&&allowed.includes(f.toLowerCase()))))fail(`${label}: key と使う fill は "auto" か、key に挙げた色（1色または配列）にしてください。`);
  }else if(p.fill!==undefined&&p.fill!=='auto'&&p.fill!=='none'&&!isHex(p.fill))fail(`${label}: fill は "auto"・"none"・"#rrggbb" のどれかにしてください。`);
  timing(p,label);
 });
}
const inside=(a:Box,b:Box)=>a[0]>=b[0]&&a[1]>=b[1]&&a[2]<=b[2]&&a[3]<=b[3];
const overlaps=(a:Box,b:Box)=>a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3];
async function decode(src:string){const image=new Image();image.src=src;await image.decode();return image;}
function canvas2d(w:number,h:number){const c=document.createElement('canvas');c.width=w;c.height=h;return{canvas:c,c:c.getContext('2d',{willReadFrequently:true})!};}
/** Median colour of a thin ring just outside the box: the surface the part sits on. */
function surround(data:ImageData,[x0,y0,x1,y1]:number[]):RGB{
 const r:number[]=[],g:number[]=[],b:number[]=[],w=data.width,h=data.height;
 const take=(x:number,y:number)=>{if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;r.push(data.data[i]);g.push(data.data[i+1]);b.push(data.data[i+2]);};
 for(let d=2;d<=4;d++){
  for(let x=x0-d;x<=x1+d;x+=2){take(x,y0-d);take(x,y1+d);}
  for(let y=y0-d;y<=y1+d;y+=2){take(x0-d,y);take(x1+d,y);}
 }
 // A part covering the whole page has no ring; fall back to the page border.
 if(!r.length)for(let x=0;x<w;x+=4){take(x,0);take(x,h-1);}
 const median=(a:number[])=>a.sort((m,n)=>m-n)[a.length>>1];
 return [median(r),median(g),median(b)];
}
/** Rebuilds one PDF page slide as layered elements. The page image stays as the slide thumbnail. */
export async function splitPage(slide:Slide,plan:PagePlan,n:number):Promise<{slide:Slide;report:SplitReport}>{
 if(slide.layout!=='page'||!slide.image)throw new Error(`スライド ${n}: PDFページ（ページを全画面表示）のスライドだけを部品に分けられます。`);
 check(plan,n,slide.duration);
 const image=await decode(slide.image),W=image.naturalWidth,H=image.naturalHeight;
 const source=canvas2d(W,H);source.c.drawImage(image,0,0);
 const original=source.c.getImageData(0,0,W,H),o=original.data;
 // Same letterboxing as the page view, so the rebuilt page lands exactly where the PDF page was.
 const fit=Math.min(WIDTH/W,HEIGHT/H),ox=(WIDTH-W*fit)/2,oy=(HEIGHT-H*fit)/2;
 const clamp=(v:number)=>Math.min(1,Math.max(0,v));
 const toPage=(b:Box):Box=>[clamp((b[0]*WIDTH-ox)/(W*fit)),clamp((b[1]*HEIGHT-oy)/(H*fit)),clamp((b[2]*WIDTH-ox)/(W*fit)),clamp((b[3]*HEIGHT-oy)/(H*fit))];
 const parts=plan.parts.map(p=>{
  const box=toPage(p.box),px=[Math.floor(box[0]*W),Math.floor(box[1]*H),Math.ceil(box[2]*W),Math.ceil(box[3]*H)];
  const [x0,y0,x1,y1]=px,w=x1-x0,h=y1-y0;
  if(w<2||h<2)throw new Error(`スライド ${n}: 「${p.name}」の box がページの外です。`);
  const ring=surround(original,px),keys=p.key===true?[ring]:Array.isArray(p.key)?p.key.map(parseHex):null,tolerance=p.tolerance??TOLERANCE;
  // alpha: how much of each pixel belongs to the part (soft edge between tolerance/2 and tolerance).
  // surface: index of the key colour a clean surface pixel matches (within tolerance/4, at least 8), else -1 for the
  // object and its antialiased fringe. Only surfaces listed in "fill" are used to fill the hole.
  const alpha=new Float32Array(w*h).fill(1),surface=new Int8Array(w*h).fill(-1);
  const fillable=keys?keys.map((k,i)=>p.fill===undefined||p.fill==='auto'||[p.fill].flat().some(f=>f.toLowerCase()===(Array.isArray(p.key)?p.key[i]:hex(k)).toLowerCase())):[];
  if(keys)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=((y0+y)*W+x0+x)*4;let dist=Infinity,nearest=0;
   keys.forEach((k,m)=>{const d=Math.hypot(o[i]-k[0],o[i+1]-k[1],o[i+2]-k[2]);if(d<dist){dist=d;nearest=m;}});
   alpha[y*w+x]=clamp((dist-tolerance*.5)/(tolerance*.5));
   if(dist<Math.max(8,tolerance*.25))surface[y*w+x]=nearest;
  }
  // patch: what is left below once the part has gone. Transparent where the page shows through unchanged.
  const patch=canvas2d(w,h);
  if(keys){
   // A fill source must sit inside a patch of its surface (5×5), so antialiased edges that happen to match a key
   // colour (white over orange can pass for beige) are never copied into the hole.
   const settled=new Uint8Array(w*h);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const k=y*w+x,m=surface[k];if(m<0||!fillable[m])continue;
    let ok=1;for(let dy=-2;dy<=2&&ok;dy++)for(let dx=-2;dx<=2;dx++){const sx=x+dx,sy=y+dy;if(sx<0||sy<0||sx>=w||sy>=h)continue;if(surface[sy*w+sx]!==m){ok=0;break;}}
    settled[k]=ok;
   }
   const out=patch.c.createImageData(w,h),d=out.data,source=(k:number)=>settled[k]===1;
   // The hole also takes in the 2px rim around the part, where its antialiased edge blends into the surface.
   const near=new Uint8Array(w*h);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(surface[y*w+x]>=0)continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const sx=x+dx,sy=y+dy;if(sx>=0&&sy>=0&&sx<w&&sy<h)near[sy*w+sx]=1;}}
   // Nearest fill surface in each direction, found with one sweep per direction.
   const left=new Int32Array(w*h),right=new Int32Array(w*h),up=new Int32Array(w*h),down=new Int32Array(w*h);
   for(let y=0;y<h;y++){let l=-1;for(let x=0;x<w;x++){const k=y*w+x;if(source(k))l=x;left[k]=l;}let r=-1;for(let x=w-1;x>=0;x--){const k=y*w+x;if(source(k))r=x;right[k]=r;}}
   for(let x=0;x<w;x++){let u=-1;for(let y=0;y<h;y++){const k=y*w+x;if(source(k))u=y;up[k]=u;}let v=-1;for(let y=h-1;y>=0;y--){const k=y*w+x;if(source(k))v=y;down[k]=v;}}
   const first=keys[Math.max(0,fillable.indexOf(true))];
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const k=y*w+x;if(surface[k]>=0&&!near[k])continue;
    let best=-1,distance=Infinity;
    const offer=(sx:number,sy:number)=>{const dd=Math.abs(sx-x)+Math.abs(sy-y);if(dd<distance){distance=dd;best=sy*w+sx;}};
    // Along the row first: flat surfaces then continue straight across the hole instead of in streaks.
    if(left[k]>=0)offer(left[k],y);if(right[k]>=0)offer(right[k],y);
    if(best<0){if(up[k]>=0)offer(x,up[k]);if(down[k]>=0)offer(x,down[k]);}
    // Surfaces are flat colours: use the key colour itself, so JPEG noise leaves no texture.
    const j=k*4;[d[j],d[j+1],d[j+2]]=best<0?first:keys[surface[best]];d[j+3]=255;
   }
   patch.c.putImageData(out,0,0);
  }else if(p.fill!=='none'){patch.c.fillStyle=typeof p.fill==='string'&&p.fill!=='auto'?p.fill:hex(ring);patch.c.fillRect(0,0,w,h);}
  return{...p,box,px,keys,tolerance,patch:p.fill==='none'&&!keys?null:patch.canvas};
 });
 // Fills the holes of parts above `level` (-1 = background) into a canvas showing `area`, topmost first so a
 // lower part's fill has the last word where they overlap. A part inside another part above `level` is skipped:
 // that part's hole already covers it.
 const punch=(c:CanvasRenderingContext2D,level:number,area:Box,offset:[number,number])=>{
  for(let j=parts.length-1;j>level;j--){
   const p=parts[j];if(!p.patch||!overlaps(p.box,area))continue;
   if(parts.some((q,k)=>k>level&&k<j&&q.patch&&inside(p.box,q.box)))continue;
   c.drawImage(p.patch,p.px[0]-offset[0],p.px[1]-offset[1]);
  }
 };
 const timing=(t:Timing|undefined,i:number)=>{
  const start=Math.min(t?.start??(i<0?0:.2+i*.25),slide.duration-.15);
  return{start,duration:Math.round((slide.duration-start)*100)/100,animation:t?.animation??'fade',...(t?.enter!==undefined?{enter:t.enter}:{}),...(t?.distance!==undefined?{distance:t.distance}:{}),...(t?.exit!==undefined?{exit:t.exit}:{}),...(t?.exitDuration!==undefined?{exitDuration:t.exitDuration}:{}),...(t?.loop!==undefined?{loop:t.loop}:{}),...(t?.cue!==undefined?{cue:t.cue}:{}),...(t?.cueOffset!==undefined?{cueOffset:t.cueOffset}:{})};
 };
 const background=canvas2d(W,H);background.c.drawImage(source.canvas,0,0);punch(background.c,-1,[0,0,1,1],[0,0]);
 const elements:SceneElement[]=[{id:crypto.randomUUID(),name:'ページの背景',type:'image',src:background.canvas.toDataURL('image/jpeg',.95),x:ox,y:oy,width:W*fit,height:H*fit,...timing(plan.background,-1)}];
 const composite=canvas2d(W,H);composite.c.drawImage(background.canvas,0,0);
 parts.forEach((p,i)=>{
  const [x0,y0,x1,y1]=p.px,w=x1-x0,h=y1-y0,part=canvas2d(w,h);
  part.c.drawImage(source.canvas,-x0,-y0);punch(part.c,i,p.box,[x0,y0]);
  // Key against the crop after the parts above were taken out, so their filled holes count as surface too.
  const data=part.c.getImageData(0,0,w,h),q=data.data;
  if(p.keys)for(let k=0;k<q.length;k+=4){const dist=Math.min(...p.keys.map(c=>Math.hypot(q[k]-c[0],q[k+1]-c[1],q[k+2]-c[2])));q[k+3]=Math.round(q[k+3]*clamp((dist-p.tolerance*.5)/(p.tolerance*.5)));}
  part.c.putImageData(data,0,0);composite.c.drawImage(part.canvas,x0,y0);
  elements.push({id:crypto.randomUUID(),name:p.name.trim(),type:'image',src:part.canvas.toDataURL('image/png'),x:ox+x0*fit,y:oy+y0*fit,width:w*fit,height:h*fit,...timing(p,i)});
 });
 // Once every part has arrived the frame should look like the PDF page again; report how far it is off.
 const rebuilt=composite.c.getImageData(0,0,W,H).data;let off=0;
 for(let k=0;k<o.length;k+=4)if(Math.abs(o[k]-rebuilt[k])+Math.abs(o[k+1]-rebuilt[k+1])+Math.abs(o[k+2]-rebuilt[k+2])>60)off++;
 return{slide:{...slide,layout:'layers',elements},report:{parts:parts.length,mismatch:off/(W*H),background:background.canvas.toDataURL('image/png')}};
}
