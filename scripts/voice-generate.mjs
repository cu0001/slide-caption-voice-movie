// Reads every caption aloud with Irodori-TTS, times the captions to the voice and puts the narration in the project.
// Usage: npm run voice:generate -- <project.json> [out.json] [--cache <dir>]
// Each caption is one spoken line: it is on screen exactly while it is said. Parts with "cue" move with their caption.
// Spoken lines are kept in the cache (default: work/voice/ next to out.json) by text, reading, voice and speed,
// so a second run only asks Irodori for the lines that changed. Settings come from .env.local (IRODORI_URL など).
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {validateProject} from '../src/model.ts';
import {readIrodoriConfig} from '../voice/irodori.js';
import {createGoogleAuth} from '../voice/googleAuth.js';
import {createReadings} from '../voice/readings.js';
import {narrate} from '../voice/narrate.js';
try{process.loadEnvFile('.env.local');}catch{/* optional: settings may come from the shell */}
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args.splice(i,2)[1];};
const cacheOption=option('--cache');
const [input,output=input]=args;
if(!input){console.error('Usage: npm run voice:generate -- <project.json> [out.json] [--cache <dir>]');process.exit(1);}
const project=validateProject(JSON.parse(readFileSync(resolve(input),'utf8')));
const config=readIrodoriConfig(),auth=createGoogleAuth(),readings=createReadings();
const cache=resolve(cacheOption??join(dirname(resolve(output)),'work','voice'));
const result=await narrate(project,{config,auth,readings,cache,onProgress:({slide,slides,caption,captions})=>process.stdout.write(`\rスライド ${slide}/${slides}・字幕 ${caption}/${captions} の音声を作成中…`)});
process.stdout.write('\n');
writeFileSync(resolve(output),JSON.stringify(project,null,2)+'\n');
console.log(result.report.join('\n')+`\n${result.summary}\n合計 ${result.seconds.toFixed(1)}秒 → ${output}`);
