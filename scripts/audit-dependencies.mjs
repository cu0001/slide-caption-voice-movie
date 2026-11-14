import {readFileSync,readdirSync,statSync,writeFileSync,mkdirSync,existsSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const forbidden=/(?:ffmpeg|ffprobe|(?:^|\/)remotion(?:$|\/)|@remotion\/|@hyperframes\/|(?:^|\/)hyperframes(?:$|\/)|@mediabunny\/(?:aac|mp3|ac3|dts|prores)-encoder)/i;
const paths=Object.keys(lock.packages).filter(Boolean),banned=paths.filter(p=>forbidden.test(p));
const binaries=[],unshippedPdfParserWasm=[];
const pdfWasmNames=new Set(['jbig2.wasm','openjpeg.wasm','qcms_bg.wasm','quickjs-eval.wasm']);
function scan(dir){for(const name of readdirSync(dir)){if(name.startsWith('.'))continue;const p=join(dir,name);if(statSync(p).isDirectory())scan(p);else if(p.startsWith('node_modules/pdfjs-dist/wasm/')&&pdfWasmNames.has(name))unshippedPdfParserWasm.push(p);else if(/\.wasm$|(?:^|\/)(?:ffmpeg|ffprobe)(?:\.|$)/i.test(p))binaries.push(p);}}
scan('node_modules');
const allowed=new Set(['MIT','ISC','BSD-2-Clause','BSD-3-Clause','Apache-2.0','MPL-2.0','0BSD','(MIT AND Zlib)']);
const unreviewed=[];
for(const [p,meta] of Object.entries(lock.packages)){if(p&&!allowed.has(meta.license))unreviewed.push({package:p,license:meta.license??null});}
const manifest=[];
for(const p of paths){if(!existsSync(join(p,'package.json')))continue;const meta=JSON.parse(readFileSync(join(p,'package.json'),'utf8'));if(forbidden.test(meta.name))banned.push(meta.name);const files=readdirSync(p).filter(n=>/^(license|licence|copying|notice)(\.|$)/i.test(n)&&statSync(join(p,n)).isFile());manifest.push({name:meta.name,version:meta.version,license:meta.license??null,repository:meta.repository??null,licenseFiles:files,packagePath:p});}
if(banned.length||binaries.length||unreviewed.length)throw new Error('Dependency audit failed: '+JSON.stringify({banned,binaries,unreviewed}));
// This directory is generated, never used for user files.
rmSync('docs/licenses',{recursive:true,force:true});mkdirSync('docs/licenses',{recursive:true});
for(const item of manifest)for(const file of item.licenseFiles)copyFileSync(join(item.packagePath,file),join('docs/licenses',item.name.replaceAll('/','__')+'-'+file));
writeFileSync('docs/dependency-licenses.json',JSON.stringify(manifest.map(({packagePath,...meta})=>meta),null,2)+'\n');
// The date is the day the findings last changed: this file is tracked, and a run that finds the same must not rewrite it.
const findings={lockfilePackages:paths.length,installedPackages:manifest.length,forbiddenDependencies:banned,forbiddenBinaries:binaries,unreviewedLicenses:unreviewed,unshippedPdfParserWasm,pdfPolicy:'PDF.js useWasm:false; public/pdf-assets allowlist excludes WASM and font binaries',output:{container:'webm',video:'vp8',audio:'opus'},audioInput:'RIFF WAV, PCM / IEEE float only; custom parser',scope:'Application packages and files; not browser/OS implementation, external patent clearance, or user media rights.'};
let previous={};try{previous=JSON.parse(readFileSync('docs/dependency-audit.json','utf8'));}catch{/* first run */}
const {checkedOn:lastChecked,...lastFindings}=previous,now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const report={checkedOn:lastChecked&&JSON.stringify(lastFindings)===JSON.stringify(findings)?lastChecked:today,...findings};
writeFileSync('docs/dependency-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
