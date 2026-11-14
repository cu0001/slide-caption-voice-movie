import {captionTextError,overlappingCaptions,type Caption} from './captions.ts';
export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
/** A whole PDF becomes one project: up to 60 pages, captioned, in one video. */
export const MAX_SLIDES = 60, MAX_SECONDS = MAX_SLIDES * 60;
export type Motion = 'none'|'zoom-in'|'zoom-out'|'pan-left'|'pan-right';
export type ElementAnimation='none'|'fade'|'slide-up'|'slide-down'|'slide-left'|'slide-right'|'pop'|'zoom'|'spin'|'drop'|'blur'|'float'|'reveal'|'lines'|'chars';
export type ElementExit='none'|'fade'|'slide-up'|'slide-down'|'slide-left'|'slide-right'|'zoom'|'spin'|'blur';
export type ElementLoop='none'|'float'|'pulse'|'sway'|'drift'|'spin';
export const ELEMENT_ANIMATIONS:ElementAnimation[]=['none','fade','slide-up','slide-down','slide-left','slide-right','pop','zoom','spin','drop','blur','float','reveal','lines','chars'];
export const ELEMENT_EXITS:ElementExit[]=['none','fade','slide-up','slide-down','slide-left','slide-right','zoom','spin','blur'];
export const ELEMENT_LOOPS:ElementLoop[]=['none','float','pulse','sway','drift','spin'];
export type SceneElement={id:string;name:string;type:'text'|'image'|'shape';x:number;y:number;width:number;height:number;start:number;duration:number;animation:ElementAnimation;enter?:number;distance?:number;exit?:ElementExit;exitDuration?:number;loop?:ElementLoop;cue?:number;cueOffset?:number;rotation?:number;opacity?:number;text?:string;src?:string;fontSize?:number;fontWeight?:number;color?:string;shape?:'rect'|'ellipse';radius?:number;clip?:{x:number;y:number;width:number;height:number;radius?:number}};
export type Slide = { id: string; eyebrow: string; title: string; body: string; duration: number; color: string; transition: 'fade' | 'push' | 'cut'; image: string | null; layout?: 'split'|'page'|'layers'; elements?:SceneElement[]; captions?:Caption[]; voice?:{lines:string[]}; motion?: Motion; motionAmount?:number; focusX?:number; focusY?:number };
export type Project = { version: 1; name: string; slides: Slide[]; audio: { src: string; name: string; start: number; volume: number; speed?: number } | null };
export const frames = (slide: Slide) => Math.round(slide.duration * FPS);
export const totalFrames = (p: Project) => p.slides.reduce((n, s) => n + frames(s), 0);
/** A length or position as 分 and 秒: whole seconds, rounded down like the player's own clock, so the two never disagree (and 59.6 is not "60秒"). */
export const clock=(seconds:number)=>{const whole=Math.floor(seconds+1e-9);return `${Math.floor(whole/60)}分${String(whole%60).padStart(2,'0')}秒`;};
export function locate(p: Project, frame: number) {
  let start = 0;
  for (let index = 0; index < p.slides.length; index++) {
    const count = frames(p.slides[index]);
    if (frame < start + count || index === p.slides.length - 1) return { index, local: Math.max(0, frame - start), start };
    start += count;
  }
  throw new Error('スライドがありません。');
}
const data = (s: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
const art = (color: string, variant: number) => data(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="900" viewBox="0 0 800 900"><rect width="800" height="900" fill="#11272d"/><circle cx="${280 + variant * 55}" cy="340" r="260" fill="${color}"/><circle cx="480" cy="580" r="220" fill="#193a41"/><path d="M40 680 Q340 150 770 410" fill="none" stroke="#f1f1dd" stroke-width="3"/><path d="M40 720 Q340 190 770 450" fill="none" stroke="#f1f1dd" stroke-opacity=".35" stroke-width="2"/><rect x="160" y="220" width="290" height="420" rx="145" fill="#e7eee2" fill-opacity=".14"/><circle cx="610" cy="200" r="38" fill="#e8efdf"/></svg>`);
export const demo: Project = {
  version: 1, name: '小さなアイデアに、動きを。', audio: { src: '/demo.wav', name: 'デモ音楽（合成音）', start: 0, volume: 0.35 },
  slides: [
    {id:'one',eyebrow:'01 / MAKE IT MOVE',title:'小さなアイデアに、\n動きを。',body:'画像と言葉を重ねて、伝わるスライド動画へ。',duration:4,color:'#bce798',transition:'fade',image:art('#bce798',0)},
    {id:'two',eyebrow:'02 / FIND YOUR RHYTHM',title:'言葉も、写真も。\n同じリズムで。',body:'やわらかな切り替えと、時間に沿ったアニメーション。',duration:4,color:'#e9b48c',transition:'push',image:art('#e9b48c',1)},
    {id:'three',eyebrow:'03 / READY TO SHARE',title:'音を添えて、\nひとつの物語に。',body:'プレビューした動きを、そのままWebMに。',duration:4,color:'#9cd4e3',transition:'fade',image:art('#9cd4e3',2)},
  ],
};
export function validateProject(value: unknown): Project {
  const p = value as Project;
  const fail = (s: string): never => {throw new Error(s);};
  if (!p || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 100 || !Array.isArray(p.slides) || !p.slides.length || p.slides.length > MAX_SLIDES) fail(`形式が正しくありません。version: 1、1〜${MAX_SLIDES}枚のスライドが必要です。`);
  const safeImage = (s: unknown) => s === null || (typeof s === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/.test(s));
  const ids = new Set();
  for (const s of p.slides) {
    if (!s || typeof s.id !== 'string' || ids.has(s.id)) fail('スライドIDが不正か重複しています。');
    ids.add(s.id);
    if(s.layout!==undefined&&!['split','page','layers'].includes(s.layout))fail('表示方法が不正です。');
    if(s.elements!==undefined){
      if(!Array.isArray(s.elements)||s.elements.length>40)fail('要素は1スライド40個以内にしてください。');
      const layerIds=new Set();
      const finite=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
      for(const e of s.elements){
        if(!e||typeof e.id!=='string'||layerIds.has(e.id)||typeof e.name!=='string'||e.name.length>60||!['text','image','shape'].includes(e.type))fail('要素の種類・名前・IDが不正です。');
        layerIds.add(e.id);
        if(!finite(e.x,-1280,2560)||!finite(e.y,-720,1440)||!finite(e.width,1,2560)||!finite(e.height,1,1440)||!finite(e.start,0,s.duration)||!finite(e.duration,.05,s.duration)||e.start+e.duration>s.duration+.001)fail('要素の位置・サイズ・表示時間が不正です。');
        if(!ELEMENT_ANIMATIONS.includes(e.animation)||e.exit!==undefined&&!ELEMENT_EXITS.includes(e.exit)||e.loop!==undefined&&!ELEMENT_LOOPS.includes(e.loop))fail('要素の動きが不正です。');
        if(e.enter!==undefined&&!finite(e.enter,.1,3)||e.distance!==undefined&&!finite(e.distance,0,1000)||e.exitDuration!==undefined&&!finite(e.exitDuration,.1,3)||e.rotation!==undefined&&!finite(e.rotation,-360,360)||e.opacity!==undefined&&!finite(e.opacity,0,1)||e.radius!==undefined&&!finite(e.radius,0,500))fail('要素の動き・表示設定が不正です。');
        if(e.cue!==undefined&&!(Number.isInteger(e.cue)&&e.cue>=1&&e.cue<=20)||e.cueOffset!==undefined&&!finite(e.cueOffset,-3,3))fail('要素の登場の合図（字幕の番号）が不正です。');
        if(e.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(e.color))fail('要素の色が不正です。');
        if(e.type==='text'&&(typeof e.text!=='string'||e.text.length>500||e.fontSize!==undefined&&!finite(e.fontSize,12,150)||e.fontWeight!==undefined&&!finite(e.fontWeight,100,900)))fail('文字の要素が不正です。');
        if(e.type==='image'&&(typeof e.src!=='string'||!safeImage(e.src)))fail('画像の要素には埋め込み画像が必要です。');
        if(e.shape!==undefined&&!['rect','ellipse'].includes(e.shape))fail('図形の種類が不正です。');
        if(e.clip&&(!finite(e.clip.x,-1280,2560)||!finite(e.clip.y,-720,1440)||!finite(e.clip.width,1,2560)||!finite(e.clip.height,1,1440)||e.clip.radius!==undefined&&!finite(e.clip.radius,0,500)))fail('要素の切り抜き範囲が不正です。');
      }
    }
    if(s.captions!==undefined){
      if(!Array.isArray(s.captions)||s.captions.length>20)fail('字幕は1スライド20個以内にしてください。');
      for(const c of s.captions)if(!c||typeof c.text!=='string'||!c.text.trim()||Array.from(c.text).length>120||!Number.isFinite(c.start)||!Number.isFinite(c.duration)||c.start<0||c.duration<.1||c.start+c.duration>s.duration+.001)fail('字幕の文・表示時間が不正です。字幕はスライドの表示時間内に収めてください。');
      for(const c of s.captions){const error=captionTextError(c.text);if(error)fail(error);}
      if(overlappingCaptions(s.captions).size)fail('字幕の表示時間が重なっています。開始時刻か表示秒数を調整してください。');
    }
    if(s.voice!==undefined&&(!s.voice||!Array.isArray(s.voice.lines)||s.voice.lines.length>20||s.voice.lines.some(l=>typeof l!=='string')))fail('音声の記録が不正です。');
    if(s.motion!==undefined&&!['none','zoom-in','zoom-out','pan-left','pan-right'].includes(s.motion))fail('動きの設定が不正です。');
    for(const value of [s.motionAmount,s.focusX,s.focusY])if(value!==undefined&&(!Number.isFinite(value)||value<0||value>1))fail('動きの強さ・注目位置は0〜1で指定してください。');
    if (!['eyebrow','title','body'].every(k => typeof s[k as keyof Slide] === 'string') || s.title.length > 120 || s.body.length > 240 || s.eyebrow.length > 80) fail('テキストが不正か長すぎます。');
    if (!Number.isFinite(s.duration) || s.duration < 1 || s.duration > 60 || !/^#[0-9a-f]{6}$/i.test(s.color) || !['fade','push','cut'].includes(s.transition) || !safeImage(s.image)) fail('スライド設定が正しくありません。画像は埋め込み形式が必要です。');
  }
  if (totalFrames(p) > FPS * MAX_SECONDS) fail(`動画の長さは${MAX_SECONDS/60}分以内にしてください。`);
  if (p.audio !== null && (!p.audio || typeof p.audio.src !== 'string' || !/^data:(audio\/(wav|wave|x-wav)|application\/octet-stream);base64,/.test(p.audio.src) || typeof p.audio.name !== 'string' || !Number.isFinite(p.audio.start) || p.audio.start < 0 || p.audio.start >= totalFrames(p) / FPS || !Number.isFinite(p.audio.volume) || p.audio.volume < 0 || p.audio.volume > 1 || (p.audio.speed !== undefined && !(typeof p.audio.speed === 'number' && p.audio.speed >= 0.5 && p.audio.speed <= 2)))) fail('音声設定が正しくありません。非圧縮WAVの埋め込み音声と、動画内の開始位置が必要です。');
  return p;
}
