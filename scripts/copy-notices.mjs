import './prepare-pdf-assets.mjs';
import {cpSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
const base='public/licenses';
// Only generated notices and a pristine package source copy are stored here.
rmSync(base,{recursive:true,force:true});mkdirSync(base+'/source/mediabunny-1.62.1',{recursive:true});
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])cpSync(file,base+'/'+file);
for(const file of ['dependency-licenses.json','licenses'])cpSync('docs/'+file,base+'/'+file,{recursive:true});
cpSync('docs/CODEC_POLICY.md',base+'/CODEC_POLICY.md');
for(const file of ['src','LICENSE','package.json'])cpSync('node_modules/mediabunny/'+file,base+'/source/mediabunny-1.62.1/'+file,{recursive:true});
writeFileSync(base+'/source/mediabunny-1.62.1/README.md',`# Mediabunny 1.62.1 corresponding source\n\nThis is an unmodified source copy from the pinned mediabunny npm package.\nLicense: MPL-2.0 (LICENSE). All TypeScript source files are under src/.\nFiles are served individually; for example src/index.ts.\nNo Mediabunny source file is modified by this application.\n\nOriginal project: https://github.com/Vanilagy/mediabunny\nPinned source archive: https://registry.npmjs.org/mediabunny/-/mediabunny-1.62.1.tgz\nAll source files in that npm archive are available at no charge.\n\nThis static source copy is included when building the app. Retain it and the\nlicense notices when redistributing the built application.\n`);
const pkg=JSON.parse(readFileSync('package.json','utf8'));
writeFileSync(base+'/application.json',JSON.stringify({name:pkg.name,version:pkg.version,license:pkg.license},null,2)+'\n');

mkdirSync(base+'/licenses/pdfjs-assets',{recursive:true});
for(const file of ['LICENSE_OPENJPEG','LICENSE_JBIG2','LICENSE_PDFJS_OPENJPEG','LICENSE_PDFJS_JBIG2'])cpSync('node_modules/pdfjs-dist/wasm/'+file,base+'/licenses/pdfjs-assets/'+file);
cpSync('node_modules/pdfjs-dist/cmaps/LICENSE',base+'/licenses/pdfjs-assets/LICENSE_CMAPS');
