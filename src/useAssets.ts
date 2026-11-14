import {useEffect,useRef,useState} from 'react';
import type {Project} from './model';
import {loadAssets,type Assets} from './render';
/** The project's decoded images. A caption edit keeps the same images, so only a changed set of sources loads again. */
export function useAssets(project:Project,onError:(message:string)=>void){
 const [assets,setAssets]=useState<Assets>(new Map());
 const [ready,setReady]=useState(false);
 const load=useRef<{sources:string[];promise:Promise<Assets>}|null>(null);
 useEffect(()=>{
  let active=true;
  const sources=[...new Set(project.slides.flatMap(s=>[s.image,...(s.elements??[]).filter(e=>e.type==='image').map(e=>e.src)]).filter((s):s is string=>typeof s==='string'))].sort();
  const previous=load.current;
  if(!previous||sources.length!==previous.sources.length||sources.some((src,i)=>src!==previous.sources[i])){
   setReady(false);
   load.current={sources,promise:loadAssets(project)};
  }
  load.current!.promise.then(a=>{if(active){setAssets(a);setReady(true);}}).catch(e=>{
   if(active){load.current=null;onError('画像の読み込みに失敗しました: '+e.message);}
  });
  return()=>{active=false;};
 },[project]);
 return{assets,ready};
}
