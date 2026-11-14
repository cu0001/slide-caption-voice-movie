// 文ごとの音声を、音を削らず、重ねずに接続する。
export const splitSpeech = text => (text.match(/[^。！？!?]+[。！？!?]*[」』）)]*|[。！？!?]+/gu) ?? [])
  .map(s => s.trim()).filter(Boolean);

export const pcm = wav => {
  let format, data;
  for (let i = 12; i + 8 <= wav.length;) {
    const size = wav.readUInt32LE(i + 4), end = i + 8 + size;
    if (end > wav.length) throw new Error('音声データが途中で切れています。');
    const id = wav.toString('ascii', i, i + 4);
    if (id === 'fmt ') format = wav.subarray(i + 8, end);
    if (id === 'data') data = wav.subarray(i + 8, end);
    i = end + (size % 2);
  }
  if (!format || format.length < 16 || !data || format.readUInt16LE(0) !== 1
      || format.readUInt16LE(14) !== 16 || !format.readUInt32LE(4)
      || format.readUInt16LE(12) !== format.readUInt16LE(2) * 2
      || !format.readUInt16LE(12) || data.length % format.readUInt16LE(12)) {
    throw new Error('文間の調整には16ビットPCMのWAV音声が必要です。');
  }
  return { format, data };
};

export const joinSpeech = (wavs, pauseSeconds = 0.4) => {
  if (wavs.length === 1) return wavs[0];
  const parts = wavs.map(pcm);
  const format = parts[0].format;
  if (parts.some(p => !p.format.equals(format))) throw new Error('文ごとの音声形式が一致しません。再生成してください。');
  const silence = Buffer.alloc(Math.round(format.readUInt32LE(4) * pauseSeconds) * format.readUInt16LE(12));
  const data = Buffer.concat(parts.flatMap((p, i) => i ? [silence, p.data] : [p.data]));
  const fmtPad = format.length % 2;
  const out = Buffer.alloc(12 + 8 + format.length + fmtPad + 8 + data.length);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(format.length, 16); format.copy(out, 20);
  const offset = 20 + format.length + fmtPad;
  out.write('data', offset); out.writeUInt32LE(data.length, offset + 4); data.copy(out, offset + 8);
  return out;
};
