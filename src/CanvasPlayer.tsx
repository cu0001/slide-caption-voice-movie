import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { FPS, WIDTH, HEIGHT, totalFrames, frames, type Project } from './model';
import { drawFrame, type Assets } from './render';
import { loadPcmWav } from './audio';
import { Icon } from './Icon';
export type PlayerRef={pause:()=>void;seekTo:(frame:number)=>void;toggle:()=>void};
const timestamp=(frame:number)=>{const seconds=Math.floor(frame/FPS);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
export const CanvasPlayer=forwardRef<PlayerRef,{project:Project;assets:Assets;ready:boolean;onFrame?:(frame:number)=>void;onVolume?:(volume:number)=>void}>(function CanvasPlayer({project,assets,ready,onFrame,onVolume},ref) {
  const [frame,setFrame]=useState(24), [playing,setPlaying]=useState(false), [starting,setStarting]=useState(false), [muted,setMuted]=useState(false), [error,setError]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null), root=useRef<HTMLDivElement>(null);
  const current=useRef(24), generation=useRef(0), raf=useRef(0), context=useRef<AudioContext|null>(null), source=useRef<AudioBufferSourceNode|null>(null), gain=useRef<GainNode|null>(null);
  const count=totalFrames(project);
  function stopAudio() {
    generation.current++;cancelAnimationFrame(raf.current);
    try{source.current?.stop();}catch{/* Already stopped. */}
    source.current?.disconnect();source.current=null;gain.current=null;
    const previous=context.current;context.current=null;if(previous)void previous.close().catch(()=>{});
  }
  function pause() {stopAudio();setPlaying(false);setStarting(false);}
  function seekTo(value:number) {pause();const target=Math.max(0,Math.min(count-1,Math.round(value)));current.current=target;setFrame(target);}
  useImperativeHandle(ref,()=>({pause,seekTo,toggle:()=>{if(playing)pause();else if(ready&&!starting)void play();}}));
  useLayoutEffect(()=>{if(canvas.current)drawFrame(canvas.current,project,frame,assets);},[project,assets,frame]);
  useEffect(()=>{onFrame?.(frame);},[frame]);
  // Where each slide starts on the seek bar, so the slide boundaries can be seen.
  const starts=project.slides.slice(1).reduce<number[]>((list,s,i)=>[...list,(list[i-1]??0)+frames(project.slides[i])],[]);
  // An edit stops playback, except a volume change: that is heard while it plays.
  const shown=useRef(project);
  useEffect(()=>{
    const before=shown.current;shown.current=project;
    if(before.slides===project.slides&&before.audio?.src===project.audio?.src)return;
    pause();if(current.current>=count)seekTo(count-1);
  },[project]);
  useEffect(()=>()=>stopAudio(),[]);
  useEffect(()=>{if(gain.current)gain.current.gain.value=muted?0:(project.audio?.volume??1);},[muted,project.audio?.volume]);
  async function play() {
    pause();setError('');setStarting(true);
    const token=generation.current;
    let base=current.current>=count-1?0:current.current;
    try {
      const ctx=new AudioContext();context.current=ctx;await ctx.resume();
      const buffer=project.audio?await loadPcmWav(project.audio.src):null;
      if(generation.current!==token)return;
      const origin=ctx.currentTime;
      if(buffer && project.audio) {
        const offset=base/FPS-Math.round(project.audio.start*FPS)/FPS;
        if(offset<buffer.duration) {
          const node=ctx.createBufferSource(),volume=ctx.createGain();node.buffer=buffer;
          volume.gain.value=muted?0:project.audio.volume;node.connect(volume).connect(ctx.destination);
          node.start(origin+Math.max(0,-offset),Math.max(0,offset));node.stop(origin+(count-base)/FPS);source.current=node;gain.current=volume;
        }
      }
      current.current=base;setFrame(base);setStarting(false);setPlaying(true);
      const tick=()=>{
        if(generation.current!==token)return;
        const next=base+Math.floor((ctx.currentTime-origin)*FPS);
        if(next>=count){current.current=count-1;setFrame(count-1);pause();return;}
        current.current=next;setFrame(next);raf.current=requestAnimationFrame(tick);
      };
      raf.current=requestAnimationFrame(tick);
    }catch(e){if(generation.current===token){pause();setError(e instanceof Error?e.message:'音声を再生できません。');}}
  }
  return <div ref={root} className="canvas-player">
    <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="スライドのプレビュー"/>
    <div className="player-controls"><button aria-label={playing?'プレビューを一時停止':'プレビューを再生'} disabled={!ready||starting} onClick={()=>playing?pause():void play()}>{starting?'準備中…':<Icon name={playing?'pause':'play'}/>}</button>{project.audio&&<button aria-label={muted?'音声をオン':'音声をオフ'} title={muted?'音声はオフです':'音声はオンです'} onClick={()=>setMuted(!muted)}><Icon name={muted?'muted':'sound'}/></button>}{project.audio&&onVolume&&<input className="player-volume" aria-label="音量" title="動画に入る音声の大きさ" type="range" min={0} max={100} value={Math.round(project.audio.volume*100)} onChange={e=>onVolume(Number(e.target.value)/100)}/>}<span>{timestamp(frame)} / {timestamp(count)}</span><button aria-label="全画面表示" onClick={()=>{if(root.current)void root.current.requestFullscreen().catch(()=>setError('全画面表示を利用できません。'));}}><Icon name="fullscreen"/></button></div>
    <div className="player-track"><input className="player-seek" aria-label="プレビューの再生位置" type="range" min={0} max={count-1} value={frame} onChange={e=>seekTo(Number(e.target.value))}/>{starts.length>0&&<div className="player-marks" aria-hidden="true">{starts.map(f=><i key={f} style={{left:`${f/Math.max(1,count-1)*100}%`}}/>)}</div>}</div>
    {error&&<p className="player-error" role="alert">{error}</p>}
  </div>;
});
