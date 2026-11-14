import {test,expect,type Page} from '@playwright/test';
import {demo} from '../src/model';

const project=(name:string,duration=4)=>({...demo,name,audio:null,slides:[{...demo.slides[0],image:null,duration}]});
async function open(page:Page,p:object){
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
}
async function writeCaptions(page:Page,lines:string){
 await page.getByLabel('字幕の一括入力',{exact:true}).fill(lines);
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
}
const leaveIsBlocked=(page:Page)=>page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});

test('the total length reads the same in the player and under it, and never shows 60 seconds',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('長さ',59.6));
 await expect(page.locator('.player-controls')).toContainText('/ 0:59');
 await expect(page.locator('.meta')).toContainText('0分59秒');
});

test('an exported video stays on screen after a caption edit, marked as older than the edit',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('書き出し',1));
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();
 await download;
 const video=page.getByLabel('書き出した動画',{exact:true});
 await expect(video).toBeVisible();
 await expect(page.locator('.output')).not.toContainText('前の内容');
 await writeCaptions(page,'あとから足した字幕');
 await expect(video).toBeVisible();
 await expect(page.locator('.output')).toContainText('前の内容');
});

test('leaving the page is blocked only while there are unsaved edits',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('保存'));
 expect(await leaveIsBlocked(page)).toBe(false);
 await writeCaptions(page,'保存していない字幕');
 expect(await leaveIsBlocked(page)).toBe(true);
 const saved=page.waitForEvent('download');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await saved;
 expect(await leaveIsBlocked(page)).toBe(false);
});

test('opening another project over unsaved edits asks first, and keeps the edits when declined',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('編集中'));
 await writeCaptions(page,'保存していない字幕');
 const asked:string[]=[];
 page.once('dialog',d=>{asked.push(d.message());void d.dismiss();});
 const input=page.getByLabel('プロジェクトを開く',{exact:true});
 const next={name:'next.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project('次のプロジェクト')))};
 await input.setInputFiles(next);
 await expect.poll(()=>asked.length).toBe(1);
 expect(asked[0]).toContain('保存していない');
 await expect(page.getByRole('heading',{name:'編集中',exact:true})).toBeVisible();
 await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveValue('保存していない字幕');
 page.once('dialog',d=>void d.accept());
 await input.setInputFiles(next);
 await expect(page.getByRole('heading',{name:'次のプロジェクト',exact:true})).toBeVisible();
});

test('a deleted caption comes back with undo and goes again with redo',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('取り消し'));
 const undo=page.getByRole('button',{name:'元に戻す',exact:true}),redo=page.getByRole('button',{name:'やり直す',exact:true});
 await expect(undo).toBeDisabled();
 await writeCaptions(page,'一番目の字幕\n二番目の字幕');
 await page.getByRole('button',{name:'字幕を削除 2',exact:true}).click();
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveCount(0);
 await undo.click();
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveValue('二番目の字幕');
 await redo.click();
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveCount(0);
 await expect(redo).toBeDisabled();
});

test('the undo shortcut takes back a whole run of typing in one step',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('入力'));
 await writeCaptions(page,'元の字幕');
 const text=page.getByLabel('字幕の文 1',{exact:true});
 await text.focus();await page.keyboard.press('End');
 await text.pressSequentially('に足した文');
 await expect(text).toHaveValue('元の字幕に足した文');
 await page.keyboard.press('ControlOrMeta+z');
 await expect(text).toHaveValue('元の字幕');
 await page.keyboard.press('ControlOrMeta+Shift+z');
 await expect(text).toHaveValue('元の字幕に足した文');
});

// Chrome holds timers in a background tab to one a second; the export must not wait on them.
test('exporting does not slow down when timers are throttled as in a background tab',async({page})=>{
 await page.goto('/?sample=demo');
 const seconds=await page.evaluate(async p=>{
  const load=eval('(url)=>import(url)'),{exportWebm}=await load('/src/export.ts');
  const original=window.setTimeout;
  (window as any).setTimeout=(handler:TimerHandler,delay?:number,...rest:unknown[])=>original(handler,Math.max(1000,delay??0),...rest);
  const started=performance.now();
  try{await exportWebm(p,()=>{});}finally{window.setTimeout=original;}
  return (performance.now()-started)/1000;
 },project('裏のタブ',4));
 expect(seconds).toBeLessThan(8);
});

test('the same narration is decoded once and reused',async({page})=>{
 await page.goto('/?sample=demo');
 const same=await page.evaluate(async()=>{
  const load=eval('(url)=>import(url)'),{loadPcmWav}=await load('/src/audio.ts');
  return await loadPcmWav('/demo.wav')===await loadPcmWav('/demo.wav');
 });
 expect(same).toBe(true);
});

test('saved files are named after the project, with characters a file name cannot hold replaced',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('朝会/2026:11',1));
 const saved=page.waitForEvent('download');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 expect((await saved).suggestedFilename()).toBe('朝会_2026_11-project.json');
 const exported=page.waitForEvent('download');
 await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();
 expect((await exported).suggestedFilename()).toBe('朝会_2026_11.webm');
 await expect(page.locator('.output a')).toHaveAttribute('download','朝会_2026_11.webm');
});
