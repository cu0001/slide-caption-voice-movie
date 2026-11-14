import type {Project} from './model';
// Saving to the user's disk: the download itself, its name, and a project that carries its own audio.
const readFile = (file: File) => new Promise<string>((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);});
export function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
/** A saved or exported project must hold its audio inside it; the demo's is a file on the server. */
export async function embedProject(p: Project) {
  if (!p.audio || p.audio.src.startsWith('data:')) return p;
  const response = await fetch(p.audio.src); if (!response.ok) throw new Error('音声を保存できません。');
  const src = await readFile(new File([await response.blob()], 'audio.wav', {type:'audio/wav'}));
  return {...p, audio:{...p.audio, src}};
}
/** Download names follow the project; characters a file name cannot hold become _. */
export const fileName=(name:string)=>name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'')||'video';
