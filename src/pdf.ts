import {WIDTH,HEIGHT,FPS,MAX_SLIDES,frames,type Project,type Slide} from './model';
import {drawFrame,loadAssets} from './render';
/** PDF output is an image-based document: no system font file is embedded. */
export async function createProjectPdf(project:Project):Promise<Blob>{
  const {PDFDocument}=await import('pdf-lib');
  const pdf=await PDFDocument.create();pdf.setTitle(project.name);pdf.setCreator('スライド動画作成ツール');
  const assets=await loadAssets(project),canvas=document.createElement('canvas');canvas.width=WIDTH*2;canvas.height=HEIGHT*2;
  for(const original of project.slides){
    const still={...original,motion:'none' as const,transition:'cut' as const,elements:original.elements?.map(e=>({...e,animation:'none' as const,start:0,duration:original.duration}))};
    drawFrame(canvas,{...project,slides:[still],audio:null},Math.min(frames(still)-1,FPS*1.5),assets);
    const image=await pdf.embedPng(canvas.toDataURL('image/png'));
    pdf.addPage([WIDTH,HEIGHT]).drawImage(image,{x:0,y:0,width:WIDTH,height:HEIGHT});
  }
  const bytes=await pdf.save();return new Blob([new Uint8Array(bytes)],{type:'application/pdf'});
}
export async function importPdf(file:File,onProgress:(page:number,total:number)=>void,signal?:AbortSignal):Promise<Project>{
  if(!file.size||file.size>40*1024*1024)throw new Error('PDFは40MB以内で指定してください。');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!new TextDecoder('ascii').decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('PDF形式のファイルを指定してください。');
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdf-assets/pdf.worker.mjs';
  const loading=pdfjs.getDocument({data:bytes,useWasm:false,useWorkerFetch:false,useSystemFonts:true,cMapUrl:'/pdf-assets/cmaps/',cMapPacked:true,wasmUrl:'/pdf-assets/decoders/',stopAtErrors:true});
  const abort=()=>{void loading.destroy();};signal?.addEventListener('abort',abort,{once:true});
  const check=()=>{if(signal?.aborted)throw new DOMException('PDFの読み込みを中止しました。','AbortError');};
  try{
    check();const pdf=await loading.promise;
    if(pdf.numPages>MAX_SLIDES)throw new Error(`PDFは${MAX_SLIDES}ページ以内で指定してください。`);
    const slides:Slide[]=[];
    for(let n=1;n<=pdf.numPages;n++){
      check();onProgress(n,pdf.numPages);
      const page=await pdf.getPage(n),natural=page.getViewport({scale:1});
      if(!Number.isFinite(natural.width)||!Number.isFinite(natural.height)||natural.width<=0||natural.height<=0)throw new Error('PDFのページサイズが不正です。');
      const scale=Math.min(2400/Math.max(natural.width,natural.height),Math.sqrt(4_000_000/(natural.width*natural.height)));
      const viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d');if(!context)throw new Error('ページを画像化できません。');
      await page.render({canvasContext:context,canvas,viewport,background:'white'}).promise;
      check();
      const content=await page.getTextContent();
      const extracted=content.items.map(item=>'str' in item?item.str:'').join(' ').trim().slice(0,100);
      slides.push({id:crypto.randomUUID(),eyebrow:`PDF / ${String(n).padStart(2,'0')}`,title:extracted||`ページ ${n}`,body:'',duration:4,color:'#bce798',transition:n%2?'fade':'push',image:canvas.toDataURL('image/jpeg',.96),layout:'page',motion:(['zoom-in','pan-right','zoom-out'] as const)[(n-1)%3],motionAmount:.85,focusX:.65,focusY:.5});
      page.cleanup();canvas.width=1;canvas.height=1;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return {version:1,name:file.name.replace(/\.pdf$/i,'').slice(0,100)||'PDFスライド',slides,audio:null};
  }catch(e){
    check();if(e instanceof Error && e.name==='PasswordException')throw new Error('パスワード保護のないPDFを指定してください。');
    throw e;
  }finally{signal?.removeEventListener('abort',abort);await loading.destroy();}
}
