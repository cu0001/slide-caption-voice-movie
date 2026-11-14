import {useEffect,useRef,useState} from 'react';
import {FPS,type Slide} from './model';
import {timeCaptions,withDuration,applyCues,captionTextError,overlappingCaptions,voiceChanged,insertCaption,splitCaption,mergeCaptions,fitCaption,removeCaption,MAX_CAPTIONS,MAX_CAPTION_LENGTH,type Caption} from './captions';
// The only thing edited in the app: the selected slide's captions (text and timing). A new set of lines is timed at
// reading speed and lengthens the slide when needed. On a narrated slide the timing follows the voice and is locked;
// changed lines are marked until they are read aloud again (the app's 音声生成 button or voice:generate).
export function CaptionEditor({slide,update:apply,seek,disabled,canVoice,active}:{slide:Slide;update:(patch:Partial<Slide>,merge?:string)=>void;seek:(frame:number)=>void;disabled:boolean;canVoice:boolean;active:number}){
 const captions=slide.captions??[];
 const overlaps=overlappingCaptions(captions);
 // Parts tied to a caption (cue) follow it when it moves. `merge` names a run of edits (typing in one field) that undo takes back in one step.
 const update=(patch:Partial<Slide>,merge?:string)=>apply(applyCues({...slide,...patch}),merge);
 const spoken=slide.voice?.lines,changed=(i:number)=>spoken!==undefined&&spoken[i]!==captions[i].text;
 const stale=voiceChanged(slide);
 const [error,setError]=useState('');
 // What went wrong with adding, splitting or joining, shown at the caption it was asked on.
 const [problem,setProblem]=useState<{index:number;text:string}|null>(null);
 const list=useRef<HTMLElement>(null),focusNext=useRef<number|null>(null);
 const field=(i:number)=>list.current?.querySelector<HTMLTextAreaElement>(`[aria-label="字幕の文 ${i+1}"]`);
 useEffect(()=>{if(focusNext.current!==null){field(focusNext.current)?.focus();focusNext.current=null;}});
 const captionText=captions.map(c=>c.text).join('\n');
 const [draft,setDraft]=useState(captionText);
 // Text edits and deletions update the rewrite draft; timing edits keep an unfinished draft.
 useEffect(()=>{setDraft(captionText);},[captionText]);
 function create(){
  try {
  const {captions:next,duration}=timeCaptions(draft.split('\n'),slide.duration);
  update(duration>slide.duration?{...withDuration(slide,duration),captions:next}:{captions:next});
  setError('');
  } catch(e) {setError(e instanceof Error?e.message:String(e));}
 }
 function patch(i:number,p:Partial<Caption>,merge:string){update({captions:captions.map((c,j)=>j===i?{...c,...p}:c)},`${merge}:${i}`);}
 // Adding, splitting and joining change the caption numbers, so the whole slide (parts included) is replaced.
 function reshape(i:number,make:()=>Slide,focus?:number){
  try {update(make());setProblem(null);if(focus!==undefined)focusNext.current=focus;}
  catch(e) {setProblem({index:i,text:e instanceof Error?e.message:String(e)});}
 }
 function confirm(c:Caption){
  const first=Math.ceil(c.start*FPS),last=Math.ceil((c.start+c.duration)*FPS)-1;
  const target=Math.round((c.start+Math.min(.3,c.duration/2))*FPS);
  seek(Math.min(last,Math.max(first,target)));
 }
 return <section ref={list} className="caption-editor" aria-label="字幕の編集">
  {spoken&&<p className="hint">このスライドは読み上げ付きです。字幕の時間は音声に合わせて決まります。</p>}
  {stale&&<p className="warning" role="alert">字幕の文が読み上げの音声と違います。{canVoice?'上の「音声生成」を押すと':'「保存」したプロジェクトをAIアシスタントに渡して「音声を作り直して」と頼むと'}、直した字幕の音声だけを作り直し、時間も合わせ直します。</p>}
  {captions.map((c,i)=><div className="caption-item" key={i} aria-current={active===i||undefined}>
   <label><span className="caption-head">字幕 {i+1}{changed(i)&&<small className="changed">（音声と違う）</small>}<small className={Array.from(c.text).length>MAX_CAPTION_LENGTH-20?'length near':'length'}>{Array.from(c.text).length} / {MAX_CAPTION_LENGTH}</small></span><textarea onFocus={()=>confirm(c)} aria-label={`字幕の文 ${i+1}`} rows={2} aria-invalid={Boolean(captionTextError(c.text))} aria-describedby={captionTextError(c.text)?`caption-error-${i}`:undefined} maxLength={MAX_CAPTION_LENGTH} value={c.text} disabled={disabled} onChange={e=>patch(i,{text:e.target.value},'text')}/></label>
   {captionTextError(c.text)&&<p id={`caption-error-${i}`} className="warning" role="alert">{captionTextError(c.text)}</p>}
   {overlaps.has(i)&&<p id={`caption-overlap-${i}`} className="warning" role="alert">ほかの字幕と表示時間が重なっています。開始時刻か表示秒数を調整してください。</p>}
   <div className="timing">{spoken?<span>{c.start.toFixed(1)}秒 〜 {(c.start+c.duration).toFixed(1)}秒</span>:<><label>開始<input aria-label={`字幕の開始 ${i+1}`} aria-invalid={overlaps.has(i)} aria-describedby={overlaps.has(i)?`caption-overlap-${i}`:undefined} type="number" min={0} max={slide.duration-.1} step={.1} value={c.start} disabled={disabled} onChange={e=>patch(i,fitCaption({...c,start:Number(e.target.value)},slide.duration),'start')}/>秒</label><label>表示<input aria-label={`字幕の秒数 ${i+1}`} aria-invalid={overlaps.has(i)} aria-describedby={overlaps.has(i)?`caption-overlap-${i}`:undefined} type="number" min={.1} max={slide.duration-c.start} step={.1} value={c.duration} disabled={disabled} onChange={e=>patch(i,fitCaption({...c,duration:Number(e.target.value)},slide.duration),'duration')}/>秒</label></>}
    <button className="link" title="プレビューをこの字幕の位置に移します" disabled={disabled} onClick={()=>confirm(c)}>確認</button></div>
   {problem?.index===i&&<p className="warning" role="alert">{problem.text}</p>}
   <div className="caption-actions">
    <button className="link" aria-label={`字幕 ${i+1} を分ける`} title="カーソルの位置で2つに分けます。カーソルがなければ、まん中に近い句読点で分けます" disabled={disabled} onClick={()=>reshape(i,()=>splitCaption(slide,i,field(i)?.selectionStart))}>分ける</button>
    {i<captions.length-1&&<button className="link" aria-label={`字幕 ${i+1} を下の字幕とつなぐ`} disabled={disabled} onClick={()=>reshape(i,()=>mergeCaptions(slide,i))}>下とつなぐ</button>}
    <button className="link" aria-label={`字幕 ${i+1} の下に追加`} disabled={disabled} onClick={()=>reshape(i,()=>insertCaption(slide,i+1),i+1)}>下に追加</button>
    <button className="link" aria-label={`字幕を削除 ${i+1}`} disabled={disabled} onClick={()=>reshape(i,()=>removeCaption(slide,i))}>削除</button>
   </div>
  </div>)}
  {!captions.length&&<p className="hint">このスライドには字幕がありません。</p>}
  <details className="rewrite" open={!captions.length}>
   <summary>まとめて書き直す</summary>
   <p className="hint">1行に1つずつ入力すると、読む速さに合わせて時間を割り当てます。足りないときはスライドを伸ばします。{spoken&&'読み上げの音声は、AIアシスタントに作り直してもらいます。'}</p>
   <textarea aria-label="字幕の一括入力" rows={5} value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)}/>
   {error&&<p className="warning" role="alert">{error}</p>}
   <div className="row"><button disabled={disabled||!draft.trim()} onClick={create}>字幕を作る（時間を自動で割り当て）</button>{captions.length>0&&<button disabled={disabled} onClick={()=>{update({captions:[]});setDraft('');}}>字幕をすべて外す</button>}</div>
  </details>
  {captions.length>=MAX_CAPTIONS&&<small>字幕は1スライド{MAX_CAPTIONS}個までです。</small>}
 </section>;
}
