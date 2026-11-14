import {useRef,useState} from 'react';
import type {Project} from './model';
/**
 * The project on screen with its undo history, and whether it differs from what was last opened or saved.
 * Edits that share a `merge` name and follow within a second (typing in one field) count as one step.
 */
export function useProject(initial:Project){
 const [project,setProject]=useState(initial);
 const [saved,setSaved]=useState(initial);
 const [history,setHistory]=useState<{past:Project[];future:Project[]}>({past:[],future:[]});
 const lastEdit=useRef<{key?:string;at:number}>({at:0});
 function edit(next:Project,merge?:string){
  const now=Date.now(),joined=merge!==undefined&&lastEdit.current.key===merge&&now-lastEdit.current.at<1000;
  lastEdit.current={key:merge,at:now};
  setHistory(h=>joined?{past:h.past,future:[]}:{past:[...h.past.slice(-99),project],future:[]});
  setProject(next);
 }
 /** Undoes (`back`) or redoes one step and returns the project now shown, or nothing when there is no such step. */
 function step(back:boolean){
  const target=back?history.past.at(-1):history.future[0];if(!target)return;
  lastEdit.current={at:0};
  setHistory(back?{past:history.past.slice(0,-1),future:[project,...history.future]}:{past:[...history.past,project],future:history.future.slice(1)});
  setProject(target);
  return target;
 }
 /** Replaces the project and forgets the history. `unsaved` is for one that exists only here, such as one that just got its narration. */
 function open(next:Project,unsaved=false){
  setProject(next);if(!unsaved)setSaved(next);
  setHistory({past:[],future:[]});lastEdit.current={at:0};
 }
 return{project,dirty:project!==saved,canUndo:history.past.length>0,canRedo:history.future.length>0,edit,step,open,markSaved:setSaved};
}
