import { FPS, WIDTH, HEIGHT, frames, locate, type Project, type Slide } from './model';
import {drawElements} from './elements';
import {captionTextError} from './captions';
import {wrapPhrases} from './linebreak';
export type Assets = Map<string, HTMLImageElement>;
export async function loadAssets(project: Project): Promise<Assets> {
  const assets: Assets = new Map();
  const sources=new Set(project.slides.flatMap(s=>[s.image,...(s.elements??[]).filter(e=>e.type==='image').map(e=>e.src)]).filter((s):s is string=>typeof s==='string'));
  await Promise.all([...sources].map(async src=>{
    const image=new Image();image.src=src;await image.decode();assets.set(src,image);
  }));
  await document.fonts.ready;
  return assets;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => 1 - Math.pow(1 - clamp(n), 3);
/** Wrapping is asked for on every frame; the answer only changes with the text, font or width. */
const wrapped = new Map<string, string[]>();
function wrap(c: CanvasRenderingContext2D, text: string, width: number, balance = false): string[] {
  const key = `${c.font}|${width}|${balance}|${text}`;
  let lines = wrapped.get(key);
  if (!lines) {
    if (wrapped.size > 300) wrapped.clear();
    const widths = new Map<string, number>();
    const measure = (s: string) => { let w = widths.get(s); if (w === undefined) widths.set(s, w = c.measureText(s).width); return w; };
    wrapped.set(key, lines = wrapPhrases(text, width, measure, balance));
  }
  return lines;
}
function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size: number, maxHeight: number, weight = 500) {
  let lines: string[] = [];
  do {
    c.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    lines = wrap(c, value, width);
    if (lines.length * size * 1.4 <= maxHeight || size <= 16) break;
    size -= 2;
  } while (size >= 16);
  c.textBaseline = 'top';
  lines.forEach((line, i) => c.fillText(line, x, y + i * size * 1.4));
}
/** Camera moves are a pure function of the frame; no wall-clock or random state. */
export function pageCamera(s:Slide,local:number){
  const p=clamp(local/Math.max(1,frames(s)-1)),t=(1-Math.cos(Math.PI*p))/2;
  const amount=s.motionAmount??.85,fx=s.focusX??.5,fy=s.focusY??.5,motion=s.motion??'zoom-in';
  let zoom=1,x=.5,y=.5;
  if(motion==='zoom-in'){zoom=1+.7*amount*t;x=.5+(fx-.5)*t;y=.5+(fy-.5)*t;}
  if(motion==='zoom-out'){zoom=1+.7*amount*(1-t);x=fx+(.5-fx)*t;y=fy+(.5-fy)*t;}
  if(motion==='pan-left'||motion==='pan-right'){
    zoom=1+.6*amount;
    const reach=(1-1/zoom)/2,travel=(t-.5)*2*reach;
    x=.5+(motion==='pan-right'?travel:-travel);y=fy;
  }
  // Keep the camera inside the complete page stage, including its letterbox.
  const border=.5/zoom;x=Math.max(border,Math.min(1-border,x));y=Math.max(border,Math.min(1-border,y));
  return {zoom,x,y};
}
function drawPage(c:CanvasRenderingContext2D,s:Slide,local:number,assets:Assets){
  const image=s.image?assets.get(s.image):null;const camera=pageCamera(s,local);
  c.fillStyle='#10272d';c.fillRect(0,0,WIDTH,HEIGHT);
  c.save();c.translate(WIDTH/2,HEIGHT/2);c.scale(camera.zoom,camera.zoom);c.translate(-camera.x*WIDTH,-camera.y*HEIGHT);
  if(image){const fit=Math.min(WIDTH/image.naturalWidth,HEIGHT/image.naturalHeight),w=image.naturalWidth*fit,h=image.naturalHeight*fit;c.drawImage(image,(WIDTH-w)/2,(HEIGHT-h)/2,w,h);}
  c.restore();
  if(s.body&&!s.captions?.length){
    const enter=ease(local/(FPS*.7));c.save();c.globalAlpha*=enter;c.translate(0,24*(1-enter));
    c.fillStyle='#10272de8';c.beginPath();c.roundRect(55,HEIGHT-133,WIDTH-110,85,12);c.fill();
    c.fillStyle='#f4f3e9';text(c,s.body,80,HEIGHT-113,WIDTH-160,27,65,550);c.restore();
  }
}
const CAPTION_SIZE=34,CAPTION_FADE=.25;
/** Subtitles sit above every slide layout and ease in and out so they never pop. */
function drawCaptions(c:CanvasRenderingContext2D,s:Slide,local:number){
  const time=local/FPS,caption=(s.captions??[]).find(x=>time>=x.start&&time<x.start+x.duration);if(!caption)return;
  // Invalid edits remain in the editor with an explanation; never paint clipped text.
  if(captionTextError(caption.text))return;
  const p=Math.min(1,(time-caption.start)/CAPTION_FADE,(caption.start+caption.duration-time)/CAPTION_FADE);
  c.save();let size=CAPTION_SIZE,lines:string[]=[];
  do {
    c.font=`600 ${size}px -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;
    lines=wrap(c,caption.text,WIDTH-260,true);
    if(lines.length*size*1.45+26<=HEIGHT-88||size<=24)break;
    size-=2;
  }while(true);
  const lineHeight=size*1.45,width=Math.max(...lines.map(l=>c.measureText(l).width))+56,height=lines.length*lineHeight+26;
  const x=(WIDTH-width)/2,y=HEIGHT-44-height+(1-ease(p))*10;
  // A see-through band lets the slide show; a soft text shadow covers what the lighter band no longer does.
  c.globalAlpha*=clamp(p);c.fillStyle='rgba(12,30,34,.5)';c.beginPath();c.roundRect(x,y,width,height,14);c.fill();
  c.shadowColor='rgba(0,0,0,.6)';c.shadowBlur=6;c.shadowOffsetY=1;
  c.fillStyle='#f6f5ec';c.textAlign='center';c.textBaseline='top';lines.forEach((line,i)=>c.fillText(line,WIDTH/2,y+13+i*lineHeight+(lineHeight-size)/2));
  c.restore();
}
function slide(c: CanvasRenderingContext2D, s: Slide, local: number, index: number, count: number, assets: Assets) {
  if(s.layout==='layers'){c.fillStyle='#10272d';c.fillRect(0,0,WIDTH,HEIGHT);drawElements(c,s.elements??[],local,assets);return;}
  if(s.layout==='page'){drawPage(c,s,local,assets);return;}
  c.fillStyle = '#10272d'; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = s.color; c.fillRect(64, 68, 30, 3);
  c.fillStyle = '#d7e2db'; text(c, s.eyebrow, 110, 60, 600, 16, 32);
  const enter = ease(local / (FPS * 0.85));
  c.save(); c.globalAlpha *= enter; c.translate(0, (1 - enter) * 30);
  c.fillStyle = '#f1f2e9'; text(c, s.title, 64, 190, 625, 66, 260, 650);
  c.fillStyle = '#aebfbb'; text(c, s.body, 68, 490, 570, 23, 115);
  c.restore();
  c.save(); c.beginPath(); c.roundRect(760, 60, 455, 600, 28); c.clip();
  const image = s.image ? assets.get(s.image) : null;
  if (image) {
    const scale = Math.max(455 / image.naturalWidth, 600 / image.naturalHeight) * (1.03 + clamp(local / frames(s)) * 0.09);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    c.drawImage(image, 760 + (455 - w) / 2, 60 + (600 - h) / 2, w, h);
  } else {
    c.fillStyle = s.color; c.fillRect(760, 60, 455, 600);
    c.fillStyle = '#10272d'; c.beginPath(); c.arc(980, 360, 150 + Math.sin(local / FPS) * 20, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  c.fillStyle = '#728e8b'; text(c, 'SLIDE VIDEO MAKER', 68, 646, 480, 13, 22);
  for (let i=0; i<count; i++) {c.fillStyle = i === index ? s.color : '#355056'; c.fillRect(520 + i * 28, 652, 18, 3);}
}
export function drawFrame(canvas: HTMLCanvasElement, project: Project, frame: number, assets: Assets) {
  const c = canvas.getContext('2d'); if (!c) throw new Error('Canvasを利用できません。');
  c.resetTransform(); c.clearRect(0, 0, canvas.width, canvas.height);c.scale(canvas.width/WIDTH,canvas.height/HEIGHT);
  const {index, local} = locate(project, frame);
  const s = project.slides[index];
  const transition = ease(local / (FPS * 0.55));
  if (index > 0 && transition < 1 && s.transition !== 'cut') {
    const previous = project.slides[index - 1];
    c.save();
    if (s.transition === 'push') c.translate(-WIDTH * transition, 0);
    slide(c, previous, frames(previous) - 1, index - 1, project.slides.length, assets); c.restore();
    c.save();
    if (s.transition === 'fade') c.globalAlpha = transition;
    else c.translate(WIDTH * (1 - transition), 0);
    slide(c, s, local, index, project.slides.length, assets); c.restore();
  } else slide(c, s, local, index, project.slides.length, assets);
  drawCaptions(c,s,local);
}
