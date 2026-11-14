import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
test('existing coffee project exports as WebM with VP8/Opus',async({page})=>{
 await page.goto('/?sample=demo');
 await page.getByLabel('プロジェクトを開く',{exact:true}).setInputFiles('tests/fixtures/coffee-break-project.json');
 await expect(page.getByRole('status')).toHaveText('プロジェクトを開きました。');
 await expect(page.getByRole('heading',{name:'ひと息のコーヒー時間',exact:true})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'WebMを書き出す',exact:true}).click();
 const file=await download;expect(file.suggestedFilename()).toBe('ひと息のコーヒー時間.webm');await file.saveAs('examples/coffee-break/coffee-break.webm');
 const result=await page.evaluate(async()=>{
  const load=eval('(url)=>import(url)');const {Input,BlobSource,WEBM}=await load('/tests/browser-tools.ts');
  const video=document.querySelector('video[aria-label="書き出した動画"]') as HTMLVideoElement;
  const blob=await(await fetch(video.src)).blob();const input=new Input({source:new BlobSource(blob),formats:[WEBM]});
  try{const v=await input.getPrimaryVideoTrack(),a=await input.getPrimaryAudioTrack();return{video:v.codec,audio:a.codec,duration:await input.computeDuration(),bytes:blob.size};}finally{input.dispose();}
 });
 expect(result.video).toBe('vp8');expect(result.audio).toBe('opus');expect(Math.abs(result.duration-12)).toBeLessThan(.05);
 await writeFile('docs/coffee-webm-verification.json',JSON.stringify(result,null,2)+'\n');
 await page.waitForFunction(()=>{const video=document.querySelector('video[aria-label="書き出した動画"]') as HTMLVideoElement;return video?.readyState>=2;});
 await page.locator('video[aria-label="書き出した動画"]').evaluate(async(video:HTMLVideoElement)=>{await new Promise<void>(resolve=>{video.addEventListener('seeked',()=>resolve(),{once:true});video.currentTime=.8;});});
 await page.screenshot({path:'docs/license-update-preview.png',fullPage:true});
});
