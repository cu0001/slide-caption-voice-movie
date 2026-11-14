import {useEffect,useRef} from 'react';
import {needsVoice} from './captions';
import type {Project} from './model';
/** Every slide as a thumbnail, with what it has (captions, narration) and whether its narration is out of date. */
export function SlideList({project,selected,choose,disabled,ready,total}:{project:Project;selected:number;choose:(index:number)=>void;disabled:boolean;ready:boolean;total:string}){
 const list=useRef<HTMLOListElement>(null);
 const narrated=project.slides.some(s=>s.voice);
 // Keep the selected slide visible by scrolling the list itself, never the page (the preview stays on screen).
 useEffect(()=>{
  const item=list.current?.querySelector<HTMLElement>('[aria-current=true]'),box=list.current;if(!box||!item)return;
  const top=item.offsetTop,bottom=top+item.offsetHeight;// .slides is positioned, so offsetTop is inside the list
  if(top<box.scrollTop)box.scrollTop=top-4;else if(bottom>box.scrollTop+box.clientHeight)box.scrollTop=bottom-box.clientHeight+4;
  // On a narrow screen the list is a strip that scrolls sideways.
  const left=item.offsetLeft,right=left+item.offsetWidth;
  if(left<box.scrollLeft)box.scrollLeft=left-4;else if(right>box.scrollLeft+box.clientWidth)box.scrollLeft=right-box.clientWidth+4;
 },[selected]);
 return <section className="filmstrip">
  <p className="meta"><span className={ready?'ready on':'ready'}>{ready?'プレビュー準備完了':'素材を読み込み中…'}</span><span>{total}</span></p>
  <ol ref={list} className="slides" aria-label="スライド一覧">{project.slides.map((s,i)=><li key={s.id}><button aria-label={`スライド ${i+1}`} aria-current={selected===i} disabled={disabled} onClick={()=>choose(i)}>
   <span className="thumb" style={{background:s.color}}>{s.image && <img src={s.image} alt=""/>}</span>
   <span className="slide-label"><b>{i+1}</b>{s.captions?.length?`字幕 ${s.captions.length}${s.voice?'・音声':''}`:'字幕なし'}{needsVoice(s,narrated)&&<em className="stale" title="字幕が読み上げの音声と違います">作り直し</em>}</span>
  </button></li>)}</ol>
 </section>;
}
