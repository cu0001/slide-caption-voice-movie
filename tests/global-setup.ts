import {execFileSync} from 'node:child_process';
export default function setup(){
 execFileSync(process.execPath,['--experimental-strip-types','--no-warnings=ExperimentalWarning','scripts/prepare-samples.mjs'],{stdio:'inherit'});
}
