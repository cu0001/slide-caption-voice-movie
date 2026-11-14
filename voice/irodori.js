// 音声生成（npm run voice:generate から使う）: Irodori-TTS-Server（OpenAI 互換 /v1/audio/speech）を呼び、WAV を返す。
// 認証: IRODORI_API_KEY があれば Bearer、*.run.app なら ADC/サービスアカウントの ID トークン、
// それ以外（ローカルの Irodori や gcloud run services proxy の localhost）は認証なし。
// 送る文章には読み方辞書（readings.js）を適用する。字幕は元の原稿のまま。
import { createReadings } from './readings.js';
import { splitSpeech, joinSpeech } from './speechWav.js';

const defaultReadings = createReadings();

export const DEFAULT_IRODORI_URL = 'http://localhost:8088';

// 話す速さ（1.0 が標準、1.1 で約1割速い）。モデルが発話の長さを縮めるので声の高さは変わらない。
const readSpeed = (value) => {
  if (!value?.trim()) return 1;
  const speed = Number(value);
  if (!(speed >= 0.5 && speed <= 2)) throw new Error('IRODORI_SPEED は 0.5〜2.0 の数値で指定してください。');
  return speed;
};

export const readIrodoriConfig = (env = process.env) => ({
  url: env.IRODORI_URL?.trim().replace(/\/+$/, '') || DEFAULT_IRODORI_URL,
  voice: env.IRODORI_VOICE?.trim() || 'none',
  caption: env.IRODORI_CAPTION?.trim() || '',
  apiKey: env.IRODORI_API_KEY?.trim() || '',
  speed: readSpeed(env.IRODORI_SPEED),
});

const authHeaders = async ({ url, apiKey }, auth) => {
  if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  const { origin, hostname } = new URL(url);
  if (hostname.endsWith('.run.app')) return { Authorization: `Bearer ${await auth.getIdToken(origin)}` };
  return {};
};

// 16bit PCM の WAV で、ピークが PEAK_LIMIT_DB を超えていたら全体の音量を下げる。
// Irodori は音量の上限まで出力することがあり、そのままだと再生や動画の書き出しで割れて聞こえる。
const PEAK_LIMIT_DB = -1;
export const limitPeak = (wav, limitDb = PEAK_LIMIT_DB) => {
  if (wav.readUInt16LE(34) !== 16) return wav;
  let offset = 12;
  while (offset + 8 <= wav.length && wav.toString('latin1', offset, offset + 4) !== 'data') offset += 8 + wav.readUInt32LE(offset + 4);
  if (offset + 8 > wav.length) return wav;
  const start = offset + 8;
  const end = Math.min(wav.length, start + wav.readUInt32LE(offset + 4)) & ~1;
  let peak = 0;
  for (let i = start; i < end; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  const limit = 32767 * 10 ** (limitDb / 20);
  if (peak <= limit) return wav;
  const gain = limit / peak;
  const out = Buffer.from(wav);
  for (let i = start; i < end; i += 2) out.writeInt16LE(Math.round(wav.readInt16LE(i) * gain), i);
  return out;
};

const isWav = (bytes) => bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WAVE';

// 成功時は { status: 200, audio: Buffer(WAV) }、失敗時は { status, message } を返す。
// `signal` は中止の合図。1文ごとに TIMEOUT_MS で打ち切る（初回はサーバーの起動に1〜2分かかるので長めにしている）。
const TIMEOUT_MS = 5 * 60_000;
export const synthesize = async (config, text, auth, applyReadings = defaultReadings, signal) => {
  const audio = [];
  // 辞書適用前に分割する。バージョン番号や Node.js のピリオドでは切らない。
  for (const sentence of splitSpeech(text.trim())) {
    const result = await synthesizeSentence(config, sentence, auth, applyReadings, signal);
    if (!result.audio) return result;
    audio.push(result.audio);
  }
  if (!audio.length) return { status: 400, message: '読み上げる文章がありません。' };
  try { return { status: 200, audio: joinSpeech(audio) }; }
  catch (e) { return { status: 502, message: e.message }; }
};

const synthesizeSentence = async (config, text, auth, applyReadings, signal) => {
  const input = applyReadings(text.trim());
  let upstream;
  try {
    upstream = await fetch(`${config.url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...await authHeaders(config, auth) },
      body: JSON.stringify({ model: 'irodori-tts', input, voice: config.voice, response_format: 'wav',
        ...(config.speed && config.speed !== 1 ? { speed: config.speed } : {}),
        ...(config.caption ? { irodori: { caption: config.caption } } : {}) }),
      signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(signal ? [signal] : [])]),
    });
  } catch (e) {
    if (e.statusCode) throw e;
    signal?.throwIfAborted();
    if (e.name === 'TimeoutError') return { status: 504, message: `Irodori サーバーが${TIMEOUT_MS / 60_000}分たっても応答しません（${config.url}）。サーバーの状態を確認してください。` };
    return { status: 502, message: `Irodori サーバーに接続できません（${config.url}）。IRODORI_URL とサーバーの起動状態を確認してください。` };
  }
  if (!upstream.ok) {
    if (upstream.status === 401) auth.invalidate();
    const body = await upstream.text();
    let message = body.slice(0, 500);
    try { const j = JSON.parse(body); message = j.error?.message || (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail ?? j)); } catch { /* not JSON */ }
    return { status: upstream.status, message: `Irodori: ${message}` };
  }
  let audio;
  try { audio = Buffer.from(await upstream.arrayBuffer()); }
  catch (e) {
    signal?.throwIfAborted();
    return { status: 502, message: e.name === 'TimeoutError' ? `Irodori サーバーの応答が${TIMEOUT_MS / 60_000}分たっても終わりません（${config.url}）。` : 'Irodori サーバーからの音声を最後まで受け取れませんでした。' };
  }
  if (!isWav(audio)) return { status: 502, message: 'Irodori から WAV 以外の応答が返されました。' };
  return { status: 200, audio: limitPeak(audio) };
};
