import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {rmSync} from 'node:fs';
// The 音声生成 button against a stand-in for Irodori on the port playwright.config.ts gives the dev server.
// It speaks one second of tone per 10 characters, 16-bit mono 48kHz like Irodori's WAV.
function tone(input:string){
 const n=Math.round(48000*Array.from(input).length/10),wav=Buffer.alloc(44+n*2);
 wav.write('RIFF');wav.writeUInt32LE(36+n*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)wav.writeInt16LE(Math.round(8000*Math.sin(i/10)),44+i*2);
 return wav;
}
test('音声生成ボタンで字幕を読み上げ、直した字幕だけを作り直す',async({page})=>{
 rmSync('test-results/voice-cache',{recursive:true,force:true});
 const asked:{input:string;speed?:number}[]=[];
 const irodori=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{const b=JSON.parse(body);asked.push(b);res.setHeader('Content-Type','audio/wav');res.end(tone(b.input));});});
 await new Promise<void>(r=>irodori.listen(5188,'127.0.0.1',r));
 try{
  await page.goto('/?sample=captions');
  const button=page.getByRole('button',{name:'音声生成',exact:true});
  await expect(button).toBeEnabled({timeout:30000});
  await page.getByLabel('話す速さ').selectOption('1.2');
  await button.click();
  await expect(page.getByText(/音声を作りました/)).toBeVisible({timeout:60000});
  const first=asked.length;
  expect(first).toBeGreaterThan(0);
  expect(asked.every(a=>a.speed===1.2)).toBe(true);
  await expect(page.getByRole('button',{name:/スライド 1/}).first()).toContainText('音声');
  await expect(page.getByLabel('話す速さ')).toHaveValue('1.2');

  const line=page.getByRole('textbox',{name:'字幕の文 1',exact:true});
  await line.fill('直した字幕の文です。');
  await expect(page.getByRole('alert')).toContainText('上の「音声生成」を押すと');
  await button.click();
  await expect(page.getByText(/音声 新規 1・/)).toBeVisible({timeout:60000});
  expect(asked.length).toBe(first+1);
  expect(asked.at(-1)!.input).toContain('直した字幕の文');
  await expect(page.getByRole('alert')).toHaveCount(0);
 }finally{irodori.close();}
});
test('別のページからは音声生成を始められない',async({request,baseURL})=>{
 const refused=await request.post('/api/voice/generate',{headers:{Origin:'https://example.com','Content-Type':'application/json'},data:{}});
 expect(refused.status()).toBe(403);
 const own=await request.post('/api/voice/generate',{headers:{Origin:baseURL!,'Content-Type':'application/json'},data:{project:{}}});
 expect(own.status()).toBe(400);
});
test('開発サーバーがない画面にはボタンを出さない',async({page})=>{
 await page.route('**/api/voice/status',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html>'}));
 await page.goto('/?sample=captions');
 await expect(page.getByRole('button',{name:'保存',exact:true})).toBeVisible();
 await page.waitForLoadState('networkidle');
 await expect(page.getByRole('button',{name:'音声生成',exact:true})).toHaveCount(0);
});
