import { useEffect, useRef, useState } from 'react';
import { CanvasPlayer, type PlayerRef } from './CanvasPlayer';
import { Licenses } from './Licenses';
import { loadPcmWav } from './audio';
import { demo, FPS, totalFrames, frames, locate, clock, validateProject, type Project, type Slide } from './model';
import { loadAssets } from './render';
import { exportWebm, checkSupport } from './export';
import {CaptionEditor} from './CaptionEditor';
import {SlideList} from './SlideList';
import {voiceStatus,generateVoice,type VoiceProgress} from './voice';
import {needsVoice} from './captions';
import {Icon} from './Icon';
import {startsWithDemo,fetchFirstProject} from './startup';
import {download,embedProject,fileName} from './files';
import {useProject} from './useProject';
import {useAssets} from './useAssets';
// The app shows a project the slide-caption-voice-movie skill made (motion, parts, captions and narration are made by the AI assistant)
// and lets the captions be corrected and read aloud again (the 音声生成 button, available under the dev server).
const stopped=(e:unknown)=>e instanceof DOMException&&e.name==='AbortError';
export function App() {
  const {project,dirty,canUndo,canRedo,edit,step,open,markSaved} = useProject(demo);
  const [projectSession, setProjectSession] = useState(0);
  const [selected, setSelected] = useState(0);
  const [opening, setOpening] = useState(!startsWithDemo);
  const [busy, setBusy] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [voiceServer, setVoiceServer] = useState<{speed:number}|null>(null);
  const [speedChoice, setSpeedChoice] = useState<number|null>(null);
  const [progress, setProgress] = useState(0);
  // What the app last had to say; errors and finished work are coloured apart from plain guidance.
  const [note, setNote] = useState<{text:string;tone:'info'|'done'|'error'}>({text:'字幕は右側で直せます。',tone:'info'});
  const setMessage=(text:string,tone:'info'|'done'|'error'='info')=>setNote({text,tone});
  const [support, setSupport] = useState<string|null>(null);
  // The exported video and the project it shows; an edit after it marks it as older instead of throwing it away.
  const [result, setResult] = useState<{url:string;project:Project} | null>(null);
  const [dropping, setDropping] = useState(false);
  // When the running export or narration began, for the time-left estimate.
  const startedAt = useRef(0);
  // The frame on screen. `setActive` only makes the caption list redraw when another caption comes up.
  const shownFrame = useRef(24);
  const [, setActive] = useState(-1);
  const player = useRef<PlayerRef>(null);
  const cancel = useRef<AbortController | null>(null);
  // Only the latest open request may replace the project or report its result.
  const loadGeneration = useRef(0);
  const slide = project.slides[selected];
  const startOf=(index:number)=>project.slides.slice(0,index).reduce((n,s)=>n+frames(s),0);
  const {assets,ready} = useAssets(project,message=>setMessage(message,'error'));
  useEffect(() => {let active=true; checkSupport(Boolean(project.audio)).then(() => {if(active) setSupport(null);}).catch(e => {if(active) setSupport(e.message);}); return()=>{active=false;};}, [Boolean(project.audio)]);
  useEffect(() => () => {if(result) URL.revokeObjectURL(result.url);}, [result]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  useEffect(()=>{let active=true;void voiceStatus().then(s=>{if(active)setVoiceServer(s);});return()=>{active=false;};},[]);
  useEffect(()=>{
    if(startsWithDemo)return;
    let active=true;
    const request=++loadGeneration.current;
    const current=()=>active&&request===loadGeneration.current;
    fetchFirstProject().then(({value,message})=>{
      if(current()){const opened=validateProject(value);openProject(opened);setMessage(message);}
    }).catch(e=>{if(current())setMessage(e.message);}).finally(()=>{if(current())setOpening(false);});
    return()=>{active=false;};
  },[]);
  // Every edit can be undone (useProject). An edit stops the preview, except a volume change.
  function change(p: Project, merge?: string, keepPlaying=false) {if(!keepPlaying)player.current?.pause();edit(p,merge);}
  function travel(back: boolean) {
    if(busy)return;
    const target=step(back);if(!target)return;
    player.current?.pause();
    // Show the slide the step changed.
    const index=target.slides.findIndex((s,i)=>s!==project.slides[i]);
    if(index>=0&&index!==selected)choose(index);
  }
  // Opening a file starts a fresh player and editor, even when it reuses the same slide IDs.
  function openProject(p: Project, unsaved=false) {
    player.current?.pause();shownFrame.current=24;open(p,unsaved);setResult(null);
    setSelected(0);setSpeedChoice(null);setProjectSession(session=>session+1);
  }
  function update(patch: Partial<Slide>, merge?: string) {change({...project, slides:project.slides.map((s,i)=>i===selected?{...s,...patch}:s)},merge&&`${slide.id}:${merge}`);}
  function choose(index: number) {if(index<0||index>=project.slides.length)return;setSelected(index); player.current?.seekTo(startOf(index)+24);}
  // While playing or seeking, the slide list and the caption panel follow the slide on screen.
  const captionAt=(frame:number)=>{const {index,local}=locate(project,Math.min(frame,totalFrames(project)-1)),time=local/FPS;return{index,caption:(project.slides[index].captions??[]).findIndex(c=>time>=c.start&&time<c.start+c.duration)};};
  const follow=(frame:number)=>{shownFrame.current=frame;const {index,caption}=captionAt(frame);setSelected(current=>current===index?current:index);setActive(caption);};
  // ← / → (and PageUp / PageDown) move between slides, except while typing or on the seek bar.
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const t=e.target as HTMLElement;if(busy||e.altKey)return;
      // Cmd/Ctrl+Z undoes, with Shift (or Ctrl+Y) it redoes. The rewrite box is a draft, so it keeps the browser's own undo.
      if(e.metaKey||e.ctrlKey){
        const k=e.key.toLowerCase();
        if(k==='s'){e.preventDefault();void saveProject();return;}
        if(k!=='z'&&k!=='y'||t.closest('.rewrite'))return;
        e.preventDefault();travel(k==='z'&&!e.shiftKey);return;
      }
      // Space plays and pauses, unless it belongs to the control that has the focus.
      if(e.key===' '&&!t.closest('input,textarea,select,button,summary,a,[contenteditable]')){e.preventDefault();player.current?.toggle();return;}
      if(t.closest('input,textarea,select,[contenteditable]'))return;
      const step=e.key==='ArrowRight'||e.key==='PageDown'?1:e.key==='ArrowLeft'||e.key==='PageUp'?-1:0;
      if(step){e.preventDefault();choose(selected+step);}
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  });
  async function importProject(file?: File) {
    if (!file) return;
    if (dirty && !window.confirm('保存していない変更があります。破棄して別のプロジェクトを開きますか？')) return;
    const request=++loadGeneration.current;
    const current=()=>request===loadGeneration.current;
    if (file.size > 200*1024*1024) {setOpening(false);setMessage('プロジェクトは200MB以内で指定してください。','error'); return;}
    setOpening(true);
    try {
      const p = validateProject(JSON.parse(await file.text())); await loadAssets(p);
      if(!current())return;
      if (p.audio) {await loadPcmWav(p.audio.src);}
      if(current()){openProject(p); setMessage('プロジェクトを開きました。','done');}
    } catch(e) {if(current())setMessage('読み込みできません: ' + (e instanceof Error?e.message:String(e)),'error');}
    finally {if(current())setOpening(false);}
  }
  async function saveProject() {
    try {const p = validateProject(await embedProject(project)); download(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),`${fileName(project.name)}-project.json`); markSaved(project); setMessage('字幕を含むプロジェクトを保存しました。','done');} catch(e) {setMessage('保存できません: ' + (e instanceof Error?e.message:String(e)),'error');}
  }
  // The project a run started from stays as it was until the finished narration replaces it.
  async function narrate() {
    player.current?.pause(); setBusy(true); setVoicing(true); setProgress(0); setResult(null); setMessage('音声を作っています。最初の1回はサーバーの起動に1〜2分かかります。');
    startedAt.current=Date.now();
    const reading=(line:VoiceProgress)=>{setProgress(line.done/line.total);setMessage(`音声を作っています：スライド ${line.slide} の字幕 ${line.caption}（全${line.total}個中 ${line.done+1}個目）。${line.done?'':'最初の1回はサーバーの起動に1〜2分かかります。'}`);};
    cancel.current = new AbortController();
    try {
      const made = await generateVoice(validateProject(await embedProject(project)),speed,reading,cancel.current.signal);
      const keep = speedChoice;
      openProject(validateProject(made.project),true); setSpeedChoice(keep);
      setMessage(`音声を作りました（${made.summary}）。残すときは「保存」してください。`,'done');
    } catch(e) {if(stopped(e))setMessage('音声の作成を中止しました。もう一度押すと、作成済みの字幕は使い回します。');else setMessage(e instanceof Error?e.message:String(e),'error');}
    finally {setBusy(false); setVoicing(false); cancel.current = null;}
  }
  async function render() {
    player.current?.pause(); setBusy(true); setProgress(0); setResult(null); setMessage('動画を書き出しています。長い動画は数分かかります。');
    startedAt.current=Date.now();
    cancel.current = new AbortController();
    try {
      const snapshot = validateProject(await embedProject(project));
      const blob = await exportWebm(snapshot,setProgress,cancel.current.signal);
      setResult({url:URL.createObjectURL(blob),project}); download(blob,`${fileName(project.name)}.webm`); setMessage('WebMを書き出しました。下の動画で確認できます。','done');
    } catch(e) {setMessage(e instanceof Error?e.message:String(e),stopped(e)?'info':'error');}
    finally {setBusy(false); cancel.current = null;}
  }
  const speed = speedChoice ?? project.audio?.speed ?? voiceServer?.speed ?? 1;
  const speeds = [...new Set([0.8,0.9,1,1.1,1.2,1.3,speed])].sort((a,b)=>a-b);
  const hasCaptions = project.slides.some(s=>s.captions?.length);
  const narrated = project.slides.some(s=>s.voice);
  const loaded = ready && !opening;
  const toVoice = project.slides.filter(s=>needsVoice(s,narrated)).length;
  const here = captionAt(shownFrame.current);
  // A rough time left, once enough has been done to tell.
  const elapsed = (Date.now()-startedAt.current)/1000;
  const left = busy&&progress>.02&&progress<1&&elapsed>1 ? Math.max(1,Math.round(elapsed*(1-progress)/progress)) : null;
  const total=`全${project.slides.length}枚 · ${clock(totalFrames(project)/FPS)}`;
  return <div className="app"
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setDropping(true);}}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropping(false);}}
    onDrop={e=>{e.preventDefault();setDropping(false);if(!busy)void importProject(e.dataTransfer.files[0]);}}>
    {dropping&&<div className="drop-hint">ここに離すと、プロジェクト（JSON）を開きます</div>}
    <header>
      <div className="title"><span>スライド動画{dirty&&' · 保存していない変更があります'}</span><h1>{project.name}</h1></div>
      <div className="actions">
        <label className="button quiet">開く<input aria-label="プロジェクトを開く" type="file" accept=".json" disabled={busy} onChange={e=>{void importProject(e.target.files?.[0]);e.target.value='';}} /></label>
        <button className="quiet" onClick={saveProject} disabled={busy} title="プロジェクトをファイルに保存します">保存</button>
        <i className="divider"/>
        <button className="quiet icon-button" aria-label="元に戻す" onClick={()=>travel(true)} disabled={busy||!canUndo} title="元に戻す（⌘Z / Ctrl+Z）"><Icon name="undo"/></button>
        <button className="quiet icon-button" aria-label="やり直す" onClick={()=>travel(false)} disabled={busy||!canRedo} title="やり直す（⇧⌘Z / Ctrl+Y）"><Icon name="redo"/></button>
        <i className="divider"/>
        {voiceServer && <label className="speed">話す速さ<select aria-label="話す速さ" value={speed} disabled={busy} onChange={e=>setSpeedChoice(Number(e.target.value))}>{speeds.map(v=><option key={v} value={v}>{v.toFixed(2).replace(/0$/,'')}</option>)}</select></label>}
        {voiceServer && <button className="second" onClick={narrate} disabled={busy || !loaded || !hasCaptions} title={hasCaptions?'字幕を読み上げて、字幕と動きの時間を音声に合わせます':'先に字幕を書いてください'}>{voicing?`${Math.round(progress*100)}% 音声生成中`:'音声生成'}{toVoice>0&&!voicing&&<span className="count" aria-hidden="true" title={`${toVoice}枚のスライドの音声を作り直します`}>{toVoice}</span>}</button>}
        <button className="primary" onClick={render} disabled={busy || !loaded || Boolean(support)}>{busy?`${Math.round(progress*100)}% 書き出し中`:'WebMを書き出す'}</button>
      </div>
    </header>
    <main>
      <SlideList project={project} selected={selected} choose={choose} disabled={busy} ready={loaded} total={total}/>
      <section className="stage">
        <div className="preview"><CanvasPlayer key={projectSession} ref={player} project={project} assets={assets} ready={loaded && !busy} onFrame={follow} onVolume={volume=>{if(project.audio)change({...project,audio:{...project.audio,volume}},'volume',true);}}/></div>
        <nav className="pager" aria-label="スライドの移動">
          <button aria-label="前のスライド" title="前のスライド（←）" disabled={busy||selected===0} onClick={()=>choose(selected-1)}><Icon name="previous"/>前へ</button>
          <div className="pager-position"><strong>{selected+1}</strong><span> / {project.slides.length}枚</span><small>{clock(startOf(selected)/FPS)}から · ← → キーでも移動できます</small></div>
          <button aria-label="次のスライド" title="次のスライド（→）" disabled={busy||selected===project.slides.length-1} onClick={()=>choose(selected+1)}>次へ<Icon name="next"/></button>
        </nav>
        <div className={`status ${note.tone}`} role="status">{note.text}</div>
        {support&&<p className="warning">{support}</p>}
        {busy && <div className="render-progress"><progress max={1} value={progress}/>{left!==null&&<span>残り約{left>=60?`${Math.floor(left/60)}分`:''}{left%60}秒</span>}<button onClick={()=>cancel.current?.abort()}>中止</button></div>}
        {result && <div className="output"><h2>書き出した動画</h2>{result.project!==project&&<p className="hint">この動画は、いま画面にある字幕に直す前の内容です。もう一度書き出すと新しくなります。</p>}<video aria-label="書き出した動画" src={result.url} controls/><a href={result.url} download={`${fileName(result.project.name)}.webm`}>WebMをもう一度保存</a></div>}
      </section>
      <aside>
        <p className="aside-heading">スライド {selected+1} / {project.slides.length}<span>{slide.duration.toFixed(1)}秒</span></p>
        <CaptionEditor key={`${projectSession}:${slide.id}`} slide={slide} update={update} seek={frame=>player.current?.seekTo(startOf(selected)+frame)} disabled={busy} canVoice={Boolean(voiceServer)} active={here.index===selected?here.caption:-1}/>
      </aside>
    </main>
    <footer><Licenses /><span>素材はこのブラウザ内で処理します</span></footer>
  </div>;
}
