import { Output, WebMOutputFormat, StreamTarget, CanvasSource, AudioBufferSource, canEncodeVideo, canEncodeAudio } from 'mediabunny';
import { FPS, WIDTH, HEIGHT, totalFrames, type Project } from './model';
import { drawFrame, loadAssets } from './render';
import { loadPcmWav } from './audio';
import { createBlobOutput } from './blob-output';
export async function checkSupport(audio: boolean) {
  if (!window.isSecureContext || typeof window.VideoEncoder !== 'function') throw new Error('このブラウザではWebM出力を利用できません。最新版のChromeをlocalhostまたはHTTPSで開いてください。');
  if (!await canEncodeVideo('vp8', {width: WIDTH, height: HEIGHT, bitrate: 4_000_000, frameRate: FPS})) throw new Error('この環境はVP8の書き出しに対応していません。別のChrome環境でお試しください。');
  if (audio && typeof window.AudioEncoder !== 'function') throw new Error('このブラウザではOpus音声の書き出しを利用できません。');
  if (audio && !await canEncodeAudio('opus', {numberOfChannels: 2, sampleRate: 48000, bitrate:128000})) throw new Error('この環境はOpus音声の書き出しに対応していません。音声を外すか、対応するChrome環境で開いてください。');
}
// Mix a bounded window at a time, including silence before and after the WAV.
// A 60-minute stereo timeline would otherwise allocate about 1.3 GB just for PCM.
export async function* mixAudioChunks(p: Project, abort: () => void): AsyncGenerator<AudioBuffer> {
  if (!p.audio) return;
  const decoded = await loadPcmWav(p.audio.src);
  const rate = 48000, chunkFrames = rate * 5;
  const length = Math.round(totalFrames(p) / FPS * rate);
  const audioStart = Math.round(p.audio.start * FPS) / FPS;
  for (let at = 0; at < length; at += chunkFrames) {
    abort();
    const size = Math.min(chunkFrames, length - at), start = at / rate;
    if (start + size / rate <= audioStart || start >= audioStart + decoded.duration) {
      yield new AudioBuffer({numberOfChannels:2,length:size,sampleRate:rate});
    } else {
      const offline = new OfflineAudioContext(2, size, rate);
      const source = offline.createBufferSource(); source.buffer = decoded;
      const gain = offline.createGain(); gain.gain.value = p.audio.volume;
      source.connect(gain).connect(offline.destination);
      source.start(Math.max(0, audioStart - start), Math.max(0, start - audioStart));
      const buffer = await offline.startRendering();
      abort();
      yield buffer;
    }
  }
}
// Lets the page repaint and react between frames. A timer would do the same in a visible tab, but Chrome holds
// timers in a background tab to one a second, which turns a one-minute export into several minutes.
const nextTask = () => new Promise<void>(resolve => {const channel = new MessageChannel(); channel.port1.onmessage = () => {channel.port1.close(); resolve();}; channel.port2.postMessage(null);});
export async function exportWebm(project: Project, progress: (value: number) => void, signal?: AbortSignal): Promise<Blob> {
  await checkSupport(Boolean(project.audio));
  const abort = () => { if (signal?.aborted) throw new DOMException('書き出しを中止しました。', 'AbortError'); };
  abort();
  const assets = await loadAssets(project);
  abort();
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
  // Blob slices also support the muxer's final header/index rewrites. Unlike BufferTarget,
  // this does not grow and copy a single ArrayBuffer containing the entire video.
  const storage = createBlobOutput();
  const target = new StreamTarget(storage.stream, {chunked:true,chunkSize:8*1024*1024});
  const output = new Output({format: new WebMOutputFormat(), target});
  const video = new CanvasSource(canvas, {codec:'vp8', bitrate:4_000_000, keyFrameInterval:2});
  output.addVideoTrack(video, {frameRate:FPS});
  const sound = project.audio ? new AudioBufferSource({codec:'opus', bitrate:128000}) : null;
  if (sound) output.addAudioTrack(sound);
  let audioTask: Promise<void> | undefined;
  let audioError: unknown;
  try {
    await output.start();
    // Feed both tracks concurrently; do not let either queue grow without backpressure.
    if (sound) audioTask = (async () => {
      for await (const chunk of mixAudioChunks(project, abort)) {
        abort();
        await sound.add(chunk);
      }
      sound.close();
    })().catch(error => {audioError = error;});
    const count = totalFrames(project);
    for (let frame=0; frame<count; frame++) {
      abort(); if (audioError) throw audioError;
      drawFrame(canvas, project, frame, assets);
      await video.add(frame / FPS, 1 / FPS);
      if (frame % 8 === 0) {progress(frame / count * 0.95); await nextTask();}
    }
    video.close(); await audioTask; if (audioError) throw audioError; abort();
    await output.finalize(); progress(1);
    return storage.getBlob();
  } catch (error) {
    await output.cancel().catch(() => {}); await audioTask;
    throw error;
  }
}
