import {test,expect,type Page} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {rmSync} from 'node:fs';
import {demo,type Slide} from '../src/model';
import {insertCaption,splitCaption,mergeCaptions,fitCaption,overlappingCaptions} from '../src/captions';

const project=(name:string,duration=4,patch:Partial<Slide>={})=>({...demo,name,audio:null,slides:[{...demo.slides[0],image:null,duration,...patch}]});
async function open(page:Page,p:object){
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
}
async function writeCaptions(page:Page,lines:string){
 await page.getByLabel('字幕の一括入力',{exact:true}).fill(lines);
 await page.getByRole('button',{name:'字幕を作る（時間を自動で割り当て）',exact:true}).click();
}
const part=(cue:number)=>({id:`p${cue}`,name:'部品',type:'shape' as const,x:0,y:0,width:10,height:10,start:0,duration:1,animation:'fade' as const,cue});
const slide:Slide={...demo.slides[0],duration:4,captions:[{text:'あ',start:.3,duration:1.6},{text:'い',start:2.05,duration:1.6}],elements:[part(1),part(2)]};

test('a caption added between two others gets its own time, and parts keep following their caption',()=>{
 const next=insertCaption(slide,1);
 expect(next.captions!.map(c=>c.text)).toEqual(['あ','','い']);
 expect(overlappingCaptions(next.captions!).size).toBe(0);
 expect(next.captions![2].start).toBeCloseTo(3.8,2);
 expect(next.duration).toBeCloseTo(5.75,2);
 expect(next.elements!.map(e=>e.cue)).toEqual([1,3]);
});
test('a caption added to a slide that is already 60 seconds long is refused',()=>{
 expect(()=>insertCaption({...slide,duration:60},2)).toThrow('60秒');
});
test('splitting divides the text and its time, at the cursor or else at the punctuation nearest the middle',()=>{
 const long={...slide,captions:[{text:'あいう、えおか',start:.3,duration:2.8},{text:'い',start:3.2,duration:.5}]};
 const auto=splitCaption(long,0);
 expect(auto.captions!.map(c=>c.text)).toEqual(['あいう、','えおか','い']);
 expect(auto.captions![1].start).toBeCloseTo(1.9,2);
 expect(auto.captions![0].duration+auto.captions![1].duration).toBeCloseTo(2.8,2);
 expect(auto.elements!.map(e=>e.cue)).toEqual([1,3]);
 expect(splitCaption(long,0,2).captions!.slice(0,2).map(c=>c.text)).toEqual(['あい','う、えおか']);
 expect(()=>splitCaption(long,1)).toThrow('1文字');
});
test('a start typed at the end of the slide leaves a caption that can still be saved',()=>{
 for(let tenths=10;tenths<=600;tenths++){
  const duration=tenths/10,c=fitCaption({text:'あ',start:duration,duration:2},duration);
  expect(c.duration).toBeGreaterThanOrEqual(.1);
  expect(c.start+c.duration).toBeLessThanOrEqual(duration+.001);
 }
 expect(fitCaption({text:'あ',start:5.2,duration:2},5.3)).toEqual({text:'あ',start:5.2,duration:.1});
 expect(fitCaption({text:'あ',start:1,duration:0},4).duration).toBe(.1);
 expect(fitCaption({text:'あ',start:1,duration:9},4).duration).toBe(3);
});
test('joining two captions keeps their whole time, and refuses a result over 120 characters',()=>{
 const joined=mergeCaptions({...slide,elements:[part(1),part(2)]},0);
 expect(joined.captions).toEqual([{text:'あい',start:.3,duration:3.35}]);
 expect(joined.elements!.map(e=>e.cue)).toEqual([1,1]);
 const full={...slide,captions:[{text:'あ'.repeat(100),start:.3,duration:1.6},{text:'い'.repeat(30),start:2.05,duration:1.6}]};
 expect(()=>mergeCaptions(full,0)).toThrow('120文字');
});

// Start times are typed by hand here, so the second caption in the list can be the first one on screen.
test('joining and adding stay valid when the list order is not the order on screen',()=>{
 const swapped={...slide,captions:[{text:'あと',start:2.05,duration:1.6},{text:'さき',start:.3,duration:1.6}]};
 expect(mergeCaptions(swapped,0).captions).toEqual([{text:'あとさき',start:.3,duration:3.35}]);
 const added=insertCaption(swapped,2);
 expect(added.captions!.map(c=>c.start)).toEqual([3.8,.3,2.05]);
 expect(overlappingCaptions(added.captions!).size).toBe(0);
});

test('adding a caption under another puts the cursor in the new, empty one',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('追加'));
 await writeCaptions(page,'一番目\n二番目');
 await page.getByRole('button',{name:'字幕 1 の下に追加',exact:true}).click();
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveValue('');
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toBeFocused();
 await expect(page.getByLabel('字幕の文 3',{exact:true})).toHaveValue('二番目');
});
test('a caption splits at the cursor and joins back with the one below',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('分割'));
 await writeCaptions(page,'まえの文。うしろの文。');
 const first=page.getByLabel('字幕の文 1',{exact:true});
 await first.evaluate((e:HTMLTextAreaElement)=>{e.focus();e.setSelectionRange(5,5);});
 await page.getByRole('button',{name:'字幕 1 を分ける',exact:true}).click();
 await expect(first).toHaveValue('まえの文。');
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveValue('うしろの文。');
 await page.getByRole('button',{name:'字幕 1 を下の字幕とつなぐ',exact:true}).click();
 await expect(first).toHaveValue('まえの文。うしろの文。');
 await expect(page.getByLabel('字幕の文 2',{exact:true})).toHaveCount(0);
});
test('a caption moved to the very end of the slide is still saved',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('終わり',5.3));
 await writeCaptions(page,'終わりの字幕');
 await page.getByLabel('字幕の開始 1',{exact:true}).fill('5.2');
 await expect(page.getByLabel('字幕の秒数 1',{exact:true})).toHaveValue('0.1');
 const saved=page.waitForEvent('download');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 const file=JSON.parse(await readFile(await (await saved).path(),'utf8'));
 expect(file.slides[0].captions).toEqual([{text:'終わりの字幕',start:5.2,duration:.1}]);
});
test('the caption on screen is marked in the list, and clicking into a caption shows it in the preview',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('強調'));
 await writeCaptions(page,'一番目の字幕\n二番目の字幕');
 const items=page.locator('.caption-item'),seek=page.getByLabel('プレビューの再生位置',{exact:true});
 await items.nth(1).getByRole('button',{name:'確認',exact:true}).click();
 await expect(items.nth(1)).toHaveAttribute('aria-current','true');
 await expect(items.nth(0)).not.toHaveAttribute('aria-current','true');
 const second=Number(await seek.inputValue());
 await page.getByLabel('字幕の文 1',{exact:true}).click();
 await expect(items.nth(0)).toHaveAttribute('aria-current','true');
 expect(Number(await seek.inputValue())).toBeLessThan(second);
});
test('slides whose narration no longer matches are marked in the list and counted on the 音声生成 button',async({page})=>{
 const caption={text:'元の文',start:.3,duration:1.6};
 const narrated={...demo,name:'作り直し',audio:null,slides:demo.slides.slice(0,2).map(s=>({...s,image:null,captions:[caption],voice:{lines:['元の文']}}))};
 await page.goto('/?sample=demo');
 await open(page,narrated);
 const button=page.getByRole('button',{name:'音声生成',exact:true});
 await expect(button.locator('.count')).toHaveCount(0);
 await page.getByLabel('字幕の文 1',{exact:true}).fill('直した文');
 await expect(page.getByRole('button',{name:'スライド 1',exact:true})).toContainText('作り直し');
 await expect(page.getByRole('button',{name:'スライド 2',exact:true})).not.toContainText('作り直し');
 await expect(button.locator('.count')).toHaveText('1');
});
test('while narration is made, the message says which slide and caption is being read',async({page})=>{
 rmSync('test-results/voice-cache',{recursive:true,force:true});
 const silence=Buffer.alloc(44+4800);silence.write('RIFF');silence.writeUInt32LE(36+4800,4);silence.write('WAVEfmt ',8);silence.writeUInt32LE(16,16);silence.writeUInt16LE(1,20);silence.writeUInt16LE(1,22);silence.writeUInt32LE(48000,24);silence.writeUInt32LE(96000,28);silence.writeUInt16LE(2,32);silence.writeUInt16LE(16,34);silence.write('data',36);silence.writeUInt32LE(4800,40);
 const irodori=createServer((req,res)=>{req.resume();req.on('end',()=>setTimeout(()=>{res.setHeader('Content-Type','audio/wav');res.end(silence);},700));});
 await new Promise<void>(r=>irodori.listen(5188,'127.0.0.1',r));
 try{
  await page.goto('/?sample=captions');
  const button=page.getByRole('button',{name:'音声生成',exact:true});
  await expect(button).toBeEnabled({timeout:30000});
  await button.click();
  await expect(page.getByRole('status')).toContainText(/スライド 1 の字幕 1/,{timeout:20000});
  await page.getByRole('button',{name:'中止',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('中止しました');
 }finally{irodori.close();}
});
test('a long export shows roughly how much time is left',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('残り時間',40));
 await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();
 await expect(page.locator('.render-progress')).toContainText(/残り約\d+秒/,{timeout:30000});
 await page.getByRole('button',{name:'中止',exact:true}).click();
});
test('Space plays and pauses the preview, and the save shortcut saves',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('キー操作'));
 await page.locator('.title').click();
 await page.keyboard.press('Space');
 await expect(page.getByRole('button',{name:'プレビューを一時停止',exact:true})).toBeVisible();
 await page.keyboard.press('Space');
 await expect(page.getByRole('button',{name:'プレビューを再生',exact:true})).toBeVisible();
 const saved=page.waitForEvent('download');
 await page.keyboard.press('ControlOrMeta+s');
 expect((await saved).suggestedFilename()).toBe('キー操作-project.json');
});
test('a project file dropped on the window opens',async({page})=>{
 await page.goto('/?sample=demo');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 await page.evaluate(json=>{
  const data=new DataTransfer();data.items.add(new File([json],'dropped.json',{type:'application/json'}));
  document.querySelector('.app')!.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));
 },JSON.stringify(project('落としたファイル')));
 await expect(page.getByRole('heading',{name:'落としたファイル',exact:true})).toBeVisible();
});
test('the narration volume can be set in the player and is saved with the project',async({page})=>{
 await page.goto('/?sample=demo');
 await expect(page.getByText('プレビュー準備完了',{exact:true})).toBeVisible();
 const volume=page.getByLabel('音量',{exact:true});
 await expect(volume).toHaveValue('35');
 await volume.fill('80');
 const saved=page.waitForEvent('download');await page.getByRole('button',{name:'保存',exact:true}).click();
 expect(JSON.parse(await readFile((await(await saved).path())!,'utf8')).audio.volume).toBe(.8);
});
test('each caption shows its length against the limit and its box grows with the text',async({page})=>{
 await page.goto('/?sample=demo');
 await open(page,project('文字数'));
 await writeCaptions(page,'あいう');
 const text=page.getByLabel('字幕の文 1',{exact:true}),item=page.locator('.caption-item').first();
 await expect(item).toContainText('3 / 120');
 const before=(await text.boundingBox())!.height;
 await text.fill('一行目\n二行目\n三行目\n四行目\n五行目');
 await expect(item).toContainText('19 / 120');
 expect((await text.boundingBox())!.height).toBeGreaterThan(before);
});
