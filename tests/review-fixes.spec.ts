import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {demo,validateProject,type Slide} from '../src/model';
import {splitCaption,removeCaption} from '../src/captions';
// @ts-expect-error plain JavaScript that runs only in Node
import {narrate} from '../voice/narrate.js';
// @ts-expect-error plain JavaScript that runs only in Node
import {synthesize} from '../voice/irodori.js';

const part=(cue:number)=>({id:`p${cue}`,name:'部品',type:'shape' as const,x:0,y:0,width:10,height:10,start:0,duration:1,animation:'fade' as const,cue});
const base:Slide={...demo.slides[0],image:null,duration:10};

test('a caption that repeats itself splits in the middle, never into an empty half',()=>{
 for(const [text,halves] of [['ワクワク',['ワク','ワク']],['ははは',['はは','は']],['  ドキドキドキドキ',['ドキドキ','ドキドキ']]] as const){
  const s=splitCaption({...base,captions:[{text,start:.5,duration:4}]},0);
  expect(s.captions!.map(c=>c.text)).toEqual(halves);
  expect(()=>validateProject({version:1,name:'分割',audio:null,slides:[s]})).not.toThrow();
 }
});

test('removing a caption renumbers the parts tied to later captions',()=>{
 const captions=[{text:'あ',start:.3,duration:1.6},{text:'い',start:2.05,duration:1.6},{text:'う',start:3.8,duration:1.6}];
 const s={...base,captions,elements:[part(1),part(2),part(3)]};
 const first=removeCaption(s,0);
 expect(first.captions!.map(c=>c.text)).toEqual(['い','う']);
 // The part of the removed caption goes to the one that took its place; the others keep their own caption.
 expect(first.elements!.map(e=>e.cue)).toEqual([1,1,2]);
 expect(removeCaption(s,2).elements!.map(e=>e.cue)).toEqual([1,2,2]);
 const none=removeCaption({...base,captions:[captions[0]],elements:[{...part(1),cueOffset:.2}]},0);
 expect(none.captions).toEqual([]);expect(none.elements![0]).not.toHaveProperty('cue');expect(none.elements![0]).not.toHaveProperty('cueOffset');
});

test('narration for a project over 20 minutes is refused before any line is read',async()=>{
 const slides=Array.from({length:22},(_,i)=>({...base,id:`s${i}`,duration:60,...(i===21?{captions:[{text:'最後の字幕',start:.5,duration:2}]}:{})}));
 const project=validateProject({version:1,name:'長い',audio:null,slides});
 let asked=0;
 const cache=mkdtempSync(join(tmpdir(),'slide-caption-voice-movie-long-'));
 await expect(narrate(project,{config:{url:'http://127.0.0.1:9',voice:'none',caption:'',speed:1},auth:{},readings:(t:string)=>{asked++;return t;},cache})).rejects.toThrow('20分以内');
 expect(asked).toBe(0);
});

test('stopping a narration ends the request to Irodori instead of waiting for its answer',async()=>{
 // A server that accepts the request and never answers, like a model that hangs.
 const server=createServer(()=>{});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const {port}=server.address() as {port:number};
 try{
  const controller=new AbortController(),started=Date.now();
  setTimeout(()=>controller.abort(),200);
  await expect(synthesize({url:`http://127.0.0.1:${port}`,voice:'none',caption:'',apiKey:'',speed:1},'止まる文です。',{},(t:string)=>t,controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(Date.now()-started).toBeLessThan(5000);
 }finally{server.closeAllConnections();server.close();}
});

// A 4×3 PNG whose left column is red and the rest blue: a 4:3 page, shown in the 16:9 frame with margins left and right.
function png(){
 const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=(b:Buffer)=>{let c=0xffffffff;for(const v of b)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(body.length+8);out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc(body),body.length+4);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(4,0);header.writeUInt32BE(3,4);header[8]=8;header[9]=2;
 const row=Buffer.from([0,255,0,0,0,0,255,0,0,255,0,0,255]);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat([row,row,row]))),chunk('IEND',Buffer.alloc(0))]);
}
test('colors reads a page that is not 16:9 at the position shown on the grid image',async()=>{
 test.setTimeout(120000);
 const dir=mkdtempSync(join(tmpdir(),'slide-caption-voice-movie-colors-')),file=join(dir,'project.json');
 writeFileSync(file,JSON.stringify({version:1,name:'4:3',audio:null,slides:[{...base,layout:'page',image:'data:image/png;base64,'+png().toString('base64')}]}));
 // The page covers x 0.125–0.875 of the frame: 0.3 on the grid is still in its first quarter (red), 0.05 is the margin.
 const out=execFileSync('npm',['run','--silent','colors','--',file,'1','0.3,0.5','0.5,0.5','0.05,0.5'],{encoding:'utf8'});
 expect(out).toContain('0.3,0.5 #ff0000');expect(out).toContain('0.5,0.5 #0000ff');expect(out).toContain('0.05,0.5 ページの外');
});
