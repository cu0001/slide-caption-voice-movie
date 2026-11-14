// What the app shows when it starts. Without ?sample= it opens the startup project the skill last set
// (public/examples/startup/); ?sample=demo keeps the built-in demo, the others open the coffee-break.pdf examples.
const samples={coffee:'coffee-break-captions',pdf:'coffee-pdf',elements:'coffee-elements',captions:'coffee-captions'} as const;
type Startup={source:string;file:string};
const requested=new URLSearchParams(window.location.search).get('sample');
const sampleKey:keyof typeof samples|'demo'|'start'=requested==='demo'||(requested??'') in samples?requested as keyof typeof samples|'demo':'start';
/** True when the app starts on the built-in demo and has nothing to fetch. */
export const startsWithDemo=sampleKey==='demo';
// The dev server and SPA hosts answer a missing file with index.html and status 200.
const found=(r:Response)=>r.ok&&!r.headers.get('content-type')?.includes('text/html');
async function fetchStartup(){
  const r=await fetch('/examples/startup/startup.json');if(!found(r))throw new Error('起動時のプロジェクトがありません。「開く」でプロジェクトを読み込んでください。');
  const info=await r.json() as Startup;
  const p=await fetch(`/examples/startup/${info.file}`);if(!found(p))throw new Error('起動時のプロジェクトを読み込めません。');
  return {value:await p.json() as unknown,message:`${info.source} を開きました。字幕は右側で直せます。`};
}
async function fetchSample(key:keyof typeof samples){
  const r=await fetch(`/examples/${samples[key]}-project.json`);if(!found(r))throw new Error('サンプルを読み込めません。');
  return {value:await r.json() as unknown,message:'サンプルを開きました。字幕は右側で直せます。'};
}
/** The project to open first (not yet validated) and what to say about it. Not for the demo. */
export const fetchFirstProject=()=>sampleKey==='start'?fetchStartup():fetchSample(sampleKey as keyof typeof samples);
