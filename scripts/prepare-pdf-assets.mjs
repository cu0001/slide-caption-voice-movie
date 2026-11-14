import {mkdirSync,cpSync,readdirSync,rmSync} from 'node:fs';
const src='node_modules/pdfjs-dist',dst='public/pdf-assets';
rmSync(dst,{recursive:true,force:true});mkdirSync(dst+'/decoders',{recursive:true});
cpSync(src+'/build/pdf.worker.mjs',dst+'/pdf.worker.mjs');
cpSync(src+'/cmaps',dst+'/cmaps',{recursive:true});
// Only JS image-decoder fallbacks, not WASM or font binaries, are shipped.
for(const name of ['openjpeg_nowasm_fallback.js','jbig2_nowasm_fallback.js','LICENSE_OPENJPEG','LICENSE_JBIG2','LICENSE_PDFJS_OPENJPEG','LICENSE_PDFJS_JBIG2'])cpSync(src+'/wasm/'+name,dst+'/decoders/'+name);
cpSync(src+'/LICENSE',dst+'/LICENSE');
function check(dir){for(const name of readdirSync(dir,{withFileTypes:true})){const p=dir+'/'+name.name;if(name.isDirectory())check(p);else if(/\.wasm$|Liberation|\.ttf$|\.pfb$/.test(p))throw new Error('Unexpected PDF asset: '+p);}}
check(dst);
