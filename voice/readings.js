// 読み方辞書: 音声合成に渡す文章だけを置き換える（原稿・字幕はそのまま）。
// 辞書は JSON（{ "表記": "読み" }）。リクエストごとに更新日時を確認し、変更があれば読み直す
// ので、語を追加してもサーバーの再起動は不要。追加は `npm run reading -- 表記 読み`。
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_READINGS_FILE = path.resolve('voice/readings.json');

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isWordChar = (c) => /[A-Za-z0-9_]/.test(c);

// 長い表記を優先し、英数字の語は前後が英数字でないときだけ一致させる（CPU が vCPU に誤一致しない）。
// 英字は大文字小文字を区別しない。
export const compileReadings = (dict) => {
  const entries = Object.entries(dict).filter(([k, v]) => k.trim() && typeof v === 'string');
  if (!entries.length) return (text) => text;
  const lookup = new Map(entries.map(([k, v]) => [k.toLowerCase(), v]));
  const pattern = entries.map(([k]) => k).sort((a, b) => b.length - a.length).map(k =>
    `${isWordChar(k[0]) ? '(?<![A-Za-z0-9_])' : ''}${escape(k)}${isWordChar(k.at(-1)) ? '(?![A-Za-z0-9_])' : ''}`).join('|');
  const regex = new RegExp(pattern, 'gi');
  return (text) => text.replace(regex, m => lookup.get(m.toLowerCase()) ?? m);
};

export const readReadings = (file = DEFAULT_READINGS_FILE, readFile = fs.readFileSync) => {
  let text;
  try { text = readFile(file, 'utf8'); } catch { return {}; }
  const dict = JSON.parse(text);
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) throw new Error(`読み方辞書の形式が不正です: ${file}`);
  return dict;
};

export const createReadings = ({ file = process.env.READINGS_FILE || DEFAULT_READINGS_FILE } = {}) => {
  let mtime = -1;
  let apply = (text) => text;
  return (text) => {
    let current = 0;
    try { current = fs.statSync(file).mtimeMs; } catch { /* no dictionary */ }
    if (current !== mtime) {
      try { apply = compileReadings(readReadings(file)); mtime = current; }
      catch (e) { console.error('[readings]', e.message); }
    }
    return apply(text);
  };
};
