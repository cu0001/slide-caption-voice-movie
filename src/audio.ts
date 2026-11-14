/** Original PCM/IEEE-float WAV reader. No compressed-audio decoder is invoked. */
export function parsePcmWav(bytes: ArrayBuffer) {
  const fail = (): never => { throw new Error('音声は非圧縮WAV（PCM / IEEE float、1〜2ch・64MB・20分以内）で指定してください。MP3・AAC・圧縮WAVは読み込めません。'); };
  if (bytes.byteLength < 44 || bytes.byteLength > 64 * 1024 * 1024) fail();
  const v = new DataView(bytes);
  const text = (at: number, n: number) => Array.from({length:n}, (_,i)=>String.fromCharCode(v.getUint8(at+i))).join('');
  if (text(0,4) !== 'RIFF' || text(8,4) !== 'WAVE') fail();
  const end = v.getUint32(4,true) + 8;
  if (end > bytes.byteLength || end < 44) fail();
  let format: {tag:number;channels:number;rate:number;bits:number;align:number} | undefined;
  let audio: {offset:number;size:number} | undefined;
  for (let p=12; p+8<=end;) {
    const name=text(p,4), size=v.getUint32(p+4,true), start=p+8;
    if (start+size>end) fail();
    if (name==='fmt ') {
      if (format || size<16) fail();
      let tag=v.getUint16(start,true);
      const channels=v.getUint16(start+2,true), rate=v.getUint32(start+4,true), align=v.getUint16(start+12,true), bits=v.getUint16(start+14,true);
      if (tag===0xfffe) {
        if (size<40 || v.getUint16(start+16,true)<22) fail();
        // Only the standard PCM/IEEE-float subtype GUIDs are accepted.
        tag=v.getUint32(start+24,true);
        if (text(start+28,12)!=='\x00\x00\x10\x00\x80\x00\x00\xaa\x00\x38\x9b\x71') fail();
        if (v.getUint16(start+18,true)!==bits) fail();
      }
      if (![1,3].includes(tag) || channels<1 || channels>2 || rate<8000 || rate>192000 || (tag===1?![8,16,24,32].includes(bits):![32,64].includes(bits)) || align!==channels*bits/8 || v.getUint32(start+8,true)!==rate*align) fail();
      format={tag,channels,rate,bits,align};
    } else if (name==='data') {if(audio) fail();audio={offset:start,size};}
    p=start+size+(size%2);
  }
  if (!format || !audio || !audio.size || audio.size%format.align) fail();
  const f=format!, a=audio!;
  const length=a.size/f.align;
  if(length/f.rate>20*60) fail();
  const samples=Array.from({length:f.channels},()=>new Float32Array(length));
  for(let i=0;i<length;i++) for(let ch=0;ch<f.channels;ch++) {
    const p=a.offset+i*f.align+ch*f.bits/8;
    let sample:number;
    if(f.tag===3) sample=f.bits===32?v.getFloat32(p,true):v.getFloat64(p,true);
    else if(f.bits===8) sample=(v.getUint8(p)-128)/128;
    else if(f.bits===16) sample=v.getInt16(p,true)/32768;
    else if(f.bits===24) {const raw=v.getUint8(p)|(v.getUint8(p+1)<<8)|(v.getInt8(p+2)<<16);sample=raw/8388608;}
    else sample=v.getInt32(p,true)/2147483648;
    if(!Number.isFinite(sample)) fail();
    samples[ch][i]=Math.max(-1,Math.min(1,sample));
  }
  return {sampleRate:f.rate,channels:f.channels,length,samples,duration:length/f.rate};
}
async function decode(src: string) {
  const response=await fetch(src);if(!response.ok) throw new Error('WAV音声を読み込めません。');
  const pcm=parsePcmWav(await response.arrayBuffer());
  const buffer=new AudioBuffer({numberOfChannels:pcm.channels,length:pcm.length,sampleRate:pcm.sampleRate});
  pcm.samples.forEach((samples,ch)=>buffer.copyToChannel(samples,ch));
  return buffer;
}
// Reading every sample of a long narration takes seconds, and play, export and open all ask for the same one.
// Only the latest narration is kept: an AudioBuffer belongs to no context, so each caller can use it as is.
let latest: {src:string;buffer:Promise<AudioBuffer>} | null = null;
export function loadPcmWav(src: string) {
  if (latest?.src !== src) {
    const entry = {src, buffer: decode(src)};
    entry.buffer.catch(() => {if (latest === entry) latest = null;});
    latest = entry;
  }
  return latest.buffer;
}
