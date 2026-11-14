import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {timeCaptions} from '../src/captions';
import {demo,validateProject} from '../src/model';

test('long captions render every character within the canvas',async({page})=>{
 await page.goto('/?sample=demo');
 const results=await page.evaluate(async()=>{
  const load=eval('(url)=>import(url)'),{drawFrame}=await load('/src/render.ts');
  const texts=['あ'.repeat(120),('字幕の末尾まで表示します。\n').repeat(6).trim(),'あ'.repeat(98)+'\n'+Array(11).fill('い').join('\n')];
  return texts.map(text=>{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
   const context=canvas.getContext('2d')!,drawn:{text:string;y:number}[]=[];
   const fill=context.fillText.bind(context);
   context.fillText=(value,x,y)=>{drawn.push({text:value,y});fill(value,x,y);};
   const slide={id:'caption',eyebrow:'',title:'',body:'',duration:4,color:'#ffffff',transition:'cut',image:null,layout:'layers',elements:[],captions:[{text,start:0,duration:4}]};
   drawFrame(canvas,{version:1,name:'字幕',slides:[slide],audio:null},30,new Map());
   return {expected:text.replace(/\n/g,''),actual:drawn.map(line=>line.text).join(''),visible:drawn.every(line=>line.y>=0&&line.y+34<720)};
  });
 });
 for(const result of results){expect(result.actual).toBe(result.expected);expect(result.visible).toBe(true);}
});

test('caption overlaps and excessive newlines are explained and cannot be saved',async({page})=>{
 await page.goto('/?sample=demo');
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('一番目の字幕\n二番目の字幕');
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
 const second=page.getByLabel('字幕の開始 2',{exact:true}),original=await second.inputValue();
 await second.fill('0.3');
 await expect(second).toHaveAttribute('aria-invalid','true');
 await expect(page.getByRole('alert').first()).toContainText('表示時間が重なっています');
 const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()));
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('字幕の表示時間が重なっています');
 await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('字幕の表示時間が重なっています');
 expect(downloads).toEqual([]);
 await second.fill(original);
 await expect(second).toHaveAttribute('aria-invalid','false');
 const text=page.getByLabel('字幕の文 1',{exact:true});
 await text.fill(Array(40).fill('あ').join('\n'));
 await expect(text).toHaveAttribute('aria-invalid','true');
 await expect(page.getByRole('alert')).toContainText('12行以内');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('12行以内');
 expect(downloads).toEqual([]);
 await text.fill('修正しました');
 await expect(page.getByRole('alert')).toHaveCount(0);
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();
 const p=validateProject(JSON.parse(await readFile((await(await saved).path())!,'utf8')));
 expect(p.slides[0].captions?.[0].text).toBe('修正しました');
});

test('caption validation rejects overlaps in either order but accepts touching boundaries',()=>{
 const project=(captions:any[])=>({...demo,audio:null,slides:[{...demo.slides[0],captions}]});
 const a={text:'前',start:.3,duration:1},b={text:'後',start:.5,duration:.5};
 for(const captions of [[a,b],[b,a]])expect(()=>validateProject(project(captions))).toThrow('重なっています');
 expect(()=>validateProject(project([a,{...b,start:1.3}]))).not.toThrow();
 expect(()=>validateProject(project([{...a,text:Array(40).fill('あ').join('\n')}]))).toThrow('12行以内');
});

test('confirm seeks inside a short caption, including at the end of a slide',async({page})=>{
 await page.goto('/?sample=demo');
 const project={...demo,audio:null,slides:demo.slides.map((s,i)=>({...s,captions:i===0?[{text:'短い字幕',start:.3,duration:.1}]:undefined}))};
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'short.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 for(const start of [.3,3.9]){
  await page.getByLabel('字幕の開始 1',{exact:true}).fill(String(start));
  await page.getByRole('button',{name:'確認',exact:true}).click();
  const time=Number(await page.getByLabel('プレビューの再生位置',{exact:true}).inputValue())/30;
  expect(time).toBeGreaterThanOrEqual(start);expect(time).toBeLessThan(start+.1);
  await expect(page.getByRole('button',{name:'スライド 1',exact:true})).toHaveAttribute('aria-current','true');
 }
});

test('a late startup response cannot overwrite an opened project or its edits',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/examples/startup/startup.json',async route=>{await gate;await route.fulfill({json:{source:'startup',file:'project.json'}});});
 const project={...demo,name:'手動で開いたプロジェクト',audio:null,slides:demo.slides.map(s=>({...s,image:null}))};
 await page.route('**/examples/startup/project.json',route=>route.fulfill({json:{...project,name:'遅れて届く起動時プロジェクト'}}));
 await page.goto('/');
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'manual.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('手動で入力した字幕');
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
 const response=page.waitForResponse('**/examples/startup/project.json');release();await(await response).finished();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page.getByRole('heading',{name:project.name,exact:true})).toBeVisible();
 await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveValue('手動で入力した字幕');
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
});

// The dev server answers a missing file with index.html and status 200.
test('a missing startup project or sample shows the guidance, not a JSON parse error',async({page})=>{
 const html={status:200,contentType:'text/html',body:'<!doctype html><html></html>'};
 await page.route('**/examples/startup/startup.json',route=>route.fulfill(html));
 await page.goto('/');
 await expect(page.getByRole('status')).toHaveText('起動時のプロジェクトがありません。「開く」でプロジェクトを読み込んでください。');
 await page.route('**/examples/coffee-pdf-project.json',route=>route.fulfill(html));
 await page.goto('/?sample=pdf');
 await expect(page.getByRole('status')).toHaveText('サンプルを読み込めません。');
});

test('the last selected file wins even if an earlier file finishes later',async({page})=>{
 await page.addInitScript(()=>{
  const original=File.prototype.text;
  File.prototype.text=async function(){
   if(this.name==='slow.json')await new Promise<void>(resolve=>{(window as any).__releaseOpen=resolve;});
   return original.call(this);
  };
 });
 await page.goto('/?sample=demo');
 const input=page.getByLabel('プロジェクトを開く',{exact:true});
 const file=(name:string)=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...demo,name,audio:null,slides:demo.slides.map(s=>({...s,image:null}))}))});
 await input.setInputFiles(file('slow.json'));
 await page.waitForFunction(()=>typeof(window as any).__releaseOpen==='function');
 await input.setInputFiles(file('last.json'));
 await expect(page.getByRole('heading',{name:'last.json',exact:true})).toBeVisible();
 await page.evaluate(async()=>{(window as any).__releaseOpen();await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
 await expect(page.getByRole('heading',{name:'last.json',exact:true})).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
});

test('rewriting captions preserves individual text edits and deletions',async({page})=>{
 await page.goto('/?sample=demo');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const draft=page.getByLabel('字幕の一括入力',{exact:true});
 const create=page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true});
 await draft.fill('元の字幕\n削除する字幕');await create.click();
 await page.getByLabel('字幕の文 1',{exact:true}).fill('修正済みの字幕');
 await page.getByRole('button',{name:'字幕を削除 2',exact:true}).click();
 await page.locator('.rewrite summary').click();
 await expect(draft).toHaveValue('修正済みの字幕');
 // Adjusting timing must not erase an unfinished rewrite.
 await draft.fill('書きかけの字幕');
 await page.getByLabel('字幕の開始 1',{exact:true}).fill('0.5');
 await expect(draft).toHaveValue('書きかけの字幕');
 await draft.fill('修正済みの字幕');await create.click();
 await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveValue('修正済みの字幕');
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveCount(0);
});

test('opening a project resets the preview and editor even with reused slide IDs',async({page})=>{
 await page.goto('/?sample=demo');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const input=page.getByLabel('プロジェクトを開く',{exact:true});
 for(const duration of [6,1]){
  await page.getByRole('button',{name:'スライド 3',exact:true}).click();
  await page.getByLabel('字幕の一括入力',{exact:true}).fill('前のプロジェクトの下書き');
  const p={...demo,audio:null,slides:demo.slides.map(s=>({...s,duration}))};
  await input.setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
  await expect(page.getByLabel('プレビューの再生位置',{exact:true})).toHaveValue('24');
  await expect(page.getByRole('button',{name:'スライド 1',exact:true})).toHaveAttribute('aria-current','true');
  await expect(page.locator('.aside-heading')).toContainText('スライド 1 / 3');
  await expect(page.getByLabel('字幕の一括入力',{exact:true})).toHaveValue('');
 }
 // Reopening the same first slide also discards the previous file's unsaved draft.
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('同じIDの古い下書き');
 const p={...demo,audio:null,slides:demo.slides.map(s=>({...s,duration:1}))};
 await input.setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await expect(page.getByLabel('字幕の一括入力',{exact:true})).toHaveValue('');
});

test('caption timing rejects overflow without truncating text, and accepts valid boundaries',()=>{
 expect(()=>timeCaptions(Array(4).fill('あ'.repeat(120)),4)).toThrow('60秒');
 expect(()=>timeCaptions(Array(21).fill('字幕'),4)).toThrow('20個');
 expect(()=>timeCaptions(['あ'.repeat(121)],4)).toThrow('120文字');
 for(const lines of [[],['短い字幕'],Array(20).fill('字幕'),Array(2).fill('あ'.repeat(120))]){
  const timed=timeCaptions(lines,4);
  expect(()=>validateProject({...demo,audio:null,slides:[{...demo.slides[0],...timed}]})).not.toThrow();
 }
});

test('invalid edits stay visible, cannot be saved, and recover after correction',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const downloads:string[]=[];page.on('download',d=>downloads.push(d.suggestedFilename()));
 await page.goto('/?sample=demo');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const draft=page.getByLabel('字幕の一括入力',{exact:true});
 const create=page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true});
 await draft.fill(Array(4).fill('あ'.repeat(120)).join('\n'));await create.click();
 await expect(page.getByRole('alert')).toContainText('60秒');
 await expect(page.getByLabel('字幕の文 1',{exact:true})).toHaveCount(0);
 await expect(page.locator('.aside-heading')).toContainText('4.0秒');
 await draft.fill('修正する字幕。');await create.click();
 const caption=page.getByLabel('字幕の文 1',{exact:true});
 await caption.fill('   ');
 await expect(caption).toHaveAttribute('aria-invalid','true');
 await expect(page.getByRole('alert')).toContainText('入力するか');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('保存できません');
 expect(downloads).toEqual([]);
 await caption.fill('修正しました。');
 await expect(caption).toHaveAttribute('aria-invalid','false');
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();
 const path=(await(await saved).path())!;
 const p=validateProject(JSON.parse(await readFile(path,'utf8')));
 expect(p.slides[0].captions?.[0].text).toBe('修正しました。');
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles(path);
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 expect(errors).toEqual([]);
});

test('caption edits reuse decoded images, importing changed images still loads them',async({page})=>{
 await page.addInitScript(()=>{
  const original=HTMLImageElement.prototype.decode;
  (window as any).__imageDecodes=0;
  HTMLImageElement.prototype.decode=function(){(window as any).__imageDecodes++;return original.call(this);};
 });
 await page.goto('/?sample=demo');await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const before=await page.evaluate(()=>(window as any).__imageDecodes);
 await page.getByLabel('字幕の一括入力',{exact:true}).fill('字幕を編集します。');
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
 await page.getByLabel('字幕の文 1',{exact:true}).fill('字幕だけを変更しました。');
 // Saving waits for React's update and asserts the edited state is committed.
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();
 await saved;
 expect(await page.evaluate(()=>(window as any).__imageDecodes)).toBe(before);
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles('tests/fixtures/coffee-break-project.json');
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__imageDecodes)).toBeGreaterThan(before);
});
