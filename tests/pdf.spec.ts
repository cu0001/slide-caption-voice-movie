import {test,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {readFile,writeFile} from 'node:fs/promises';
// PDFs are turned into projects by the AI assistant's command-line workflow (pdf:project), which runs these same
// browser modules; the app itself has no PDF buttons, so the import is exercised here directly.
test('project → three-page PDF → full-page camera motion → VP8/Opus WebM',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const wasmRequests:string[]=[];page.on('request',r=>{if(r.url().endsWith('.wasm'))wasmRequests.push(r.url());});
 await page.goto('/?sample=demo');
 const fixture=JSON.parse(await readFile('tests/fixtures/coffee-break-project.json','utf8'));
 const result=await page.evaluate(async fixture=>{
  const load=eval('(url)=>import(url)');
  const {createProjectPdf,importPdf}=await load('/src/pdf.ts'),{validateProject}=await load('/src/model.ts'),{exportWebm}=await load('/src/export.ts');
  const {Input,BlobSource,WEBM,CanvasSink,VideoSampleSink}=await load('/tests/browser-tools.ts');
  const {pageCamera}=await load('/src/render.ts');
  const pdf=await createProjectPdf(validateProject(fixture));
  const imported=await importPdf(new File([pdf],'coffee-break.pdf',{type:'application/pdf'}),()=>{});
  const p={...imported,audio:fixture.audio,slides:imported.slides.map((s:any)=>({...s,motionAmount:1,focusX:.7}))};
  const blob=await exportWebm(validateProject(p),()=>{});const input=new Input({source:new BlobSource(blob),formats:[WEBM]});
  try{
   const v=await input.getPrimaryVideoTrack(),a=await input.getPrimaryAudioTrack();
   const sink=new CanvasSink(v);let frameCount=0;
   for await(const frame of new VideoSampleSink(v).samples()){frameCount++;frame.close();}
   const stamps=[.1,1.8,3.8,4.8,7.8,8.8,11.9],hashes=[];
   for(const t of stamps){const frame=await sink.getCanvas(t);const pixels=frame.canvas.getContext('2d').getImageData(0,0,1280,720).data;let hash=0;for(let n=0;n<pixels.length;n+=47)hash=(hash*31+pixels[n])>>>0;hashes.push(hash);}
   return{pdfBytes:pdf.size,duration:await input.computeDuration(),videoCodec:v.codec,audioCodec:a.codec,width:v.displayWidth,height:v.displayHeight,frameCount,layouts:p.slides.map((s:any)=>s.layout),cameras:p.slides.map((s:any)=>({start:pageCamera(s,0),end:pageCamera(s,119)})),hashes,pages:p.slides.length};
  }finally{input.dispose();}
 },fixture);
 expect(result.videoCodec).toBe('vp8');expect(result.audioCodec).toBe('opus');expect(result.frameCount).toBe(360);expect(result.pages).toBe(3);expect(result.duration).toBeCloseTo(12,1);
 expect(result.layouts).toEqual(['page','page','page']);
 expect(result.cameras[0].end.zoom).toBeCloseTo(1.7,2);expect(result.cameras[1].end.x-result.cameras[1].start.x).toBeGreaterThan(.3);expect(result.cameras[2].start.zoom).toBeCloseTo(1.7,2);expect(new Set(result.hashes).size).toBe(7);
 expect(wasmRequests).toEqual([]);expect(errors).toEqual([]);
 await writeFile('docs/pdf-motion-verification.json',JSON.stringify(result,null,2)+'\n');
});
// A whole PDF becomes one project (no parts): more than 30 pages is fine, up to 60.
test('PDF page limit is 60, and invalid PDFs are rejected',async({page})=>{
 test.setTimeout(240000);
 const make=async(count:number)=>{const d=await PDFDocument.create();for(let i=0;i<count;i++)d.addPage([960,540]).drawText(`page ${i+1}`,{x:60,y:270,size:48});return Buffer.from(await d.save()).toString('base64');};
 await page.goto('/?sample=demo');
 const result=await page.evaluate(async({ok,over})=>{
  const {importPdf}=await import('/src/pdf.ts');
  const file=(b64:string,name:string)=>new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],name,{type:'application/pdf'});
  const p=await importPdf(file(ok,'long.pdf'),()=>{});
  const reject=async(f:File)=>{try{await importPdf(f,()=>{});return '';}catch(e){return (e as Error).message;}};
  return{pages:p.slides.length,over:await reject(file(over,'over.pdf')),fake:await reject(new File(['This is not PDF'],'fake.pdf',{type:'application/pdf'}))};
 },{ok:await make(45),over:await make(61)});
 expect(result.pages).toBe(45);expect(result.over).toContain('60ページ以内');expect(result.fake).toContain('PDF形式');
});
test('PDF sample can be opened',async({page})=>{
 await page.goto('/?sample=pdf');await expect(page.getByRole('heading',{name:'ひと息のコーヒー時間｜PDFモーション',exact:true})).toBeVisible();await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
});
