// Runs the app's own browser code (PDF import, rendering, WebM export) from the command line.
// A private Vite server and the installed Google Chrome are started for the duration of `fn`.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
export async function withApp(fn){
 // The app page no longer imports the PDF code, so pre-bundle what the scripts load on demand: otherwise Vite finds
 // it mid-run and reloads the page ("Execution context was destroyed"). Its own cache keeps it apart from `npm run dev`.
 const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:0},cacheDir:'node_modules/.vite-cli',optimizeDeps:{include:['pdfjs-dist','pdf-lib','mediabunny']}});
 await server.listen();
 const browser=await chromium.launch({channel:'chrome'});
 try{
  const page=await browser.newPage();
  page.on('pageerror',e=>console.error('ブラウザ側のエラー:',e.message));
  // localhost is a secure context, which WebCodecs requires.
  await page.goto(server.resolvedUrls.local[0]);
  return await fn(page);
 }finally{await browser.close();await server.close();}
}
