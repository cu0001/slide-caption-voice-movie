// 読み方辞書（voice/readings.json）の追加・削除・確認。
//   npm run reading -- "Hop Node" ホップノード   追加（既にあれば上書き）
//   npm run reading -- --import <JSONファイル>    { "表記": "読み" } をまとめて登録（スキルが原稿と一緒に作る）
//   npm run reading -- --remove "Hop Node"        削除
//   npm run reading -- --list                     一覧
//   npm run reading -- --unknown <captions.json|project.json|"原稿…">  辞書にない英字の語を表示
//   npm run reading -- --preview <captions.json|project.json|"原稿…">  置き換え結果を表示
// JSON は captions.json（字幕の文の配列）でもプロジェクト（字幕の text）でもよい。
// 辞書は voice:generate が実行のたびに読み直す。
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_READINGS_FILE, compileReadings, readReadings } from '../voice/readings.js';

const file = process.env.READINGS_FILE || DEFAULT_READINGS_FILE;
const [cmd, ...rest] = process.argv.slice(2);
const dict = readReadings(file);
const save = (next) => {
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b, 'ja')));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
};
const fail = (message) => { console.error(message); process.exit(1); };
// 大文字小文字だけ違う既存の表記は置き換える（辞書の照合は大文字小文字を区別しない）。
const put = (key, reading) => {
  const existing = Object.keys(dict).find(k => k.toLowerCase() === key.toLowerCase());
  if (existing) delete dict[existing];
  dict[key] = reading;
  return existing ? (existing === key && dict[key] === reading ? 'same' : 'updated') : 'added';
};
// .json のファイルなら、その中の字幕（全スライド）を対象にする。
const targetText = () => {
  if (!rest.length) fail('対象を指定してください: captions.json・プロジェクトJSON・または文章');
  if (rest.length > 1 || !rest[0].endsWith('.json')) return rest.join(' ');
  let data;
  try { data = JSON.parse(fs.readFileSync(rest[0], 'utf8')); }
  catch (e) { fail(`JSON を読めません: ${rest[0]}（${e.message}）`); }
  return (data.slides ?? []).flatMap(s => (s.captions ?? []).map(c => typeof c === 'string' ? c : c?.text ?? '')).join('\n');
};

if (!cmd || cmd === '--help') {
  console.log('使い方: npm run reading -- 表記 読み | --import JSONファイル | --remove 表記 | --list | --unknown 対象 | --preview 対象');
} else if (cmd === '--list') {
  for (const [k, v] of Object.entries(dict)) console.log(`${k}\t${v}`);
  console.log(`(${Object.keys(dict).length} 語) ${file}`);
} else if (cmd === '--import') {
  if (!rest[0]) fail('登録する JSON ファイルを指定してください: npm run reading -- --import <ファイル>');
  let entries;
  try { entries = JSON.parse(fs.readFileSync(rest[0], 'utf8')); } catch (e) { fail(`JSON を読めません: ${rest[0]}（${e.message}）`); }
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) fail('形式は { "表記": "読み" } のオブジェクトにしてください。');
  const result = { added: [], updated: [], same: [] };
  for (const [key, reading] of Object.entries(entries)) {
    if (!key.trim() || typeof reading !== 'string' || !reading.trim()) fail(`表記と読みは空でない文字列にしてください: ${JSON.stringify(key)}`);
    result[put(key.trim(), reading.trim())].push(`${key.trim()} → ${reading.trim()}`);
  }
  save(dict);
  if (result.added.length) console.log(`追加 ${result.added.length} 語:\n  ${result.added.join('\n  ')}`);
  if (result.updated.length) console.log(`更新 ${result.updated.length} 語:\n  ${result.updated.join('\n  ')}`);
  console.log(`登録済みと同じ ${result.same.length} 語。辞書は ${Object.keys(dict).length} 語です。`);
} else if (cmd === '--remove') {
  const key = Object.keys(dict).find(k => k.toLowerCase() === rest[0]?.toLowerCase());
  if (!key) fail(`辞書にありません: ${rest[0]}`);
  delete dict[key]; save(dict); console.log(`削除しました: ${key}`);
} else if (cmd === '--preview') {
  console.log(compileReadings(dict)(targetText()));
} else if (cmd === '--unknown') {
  const converted = compileReadings(dict)(targetText());
  const words = [...new Set(converted.match(/[A-Za-z][A-Za-z0-9_.-]*(?: [A-Z][A-Za-z0-9_.-]*)*/g) ?? [])];
  console.log(words.length ? words.join('\n') : '辞書にない英字の語はありません。');
} else {
  const [key, reading] = [cmd, rest.join(' ')];
  if (!reading) fail('読みを指定してください: npm run reading -- 表記 読み');
  const status = put(key, reading); save(dict);
  console.log(`${status === 'added' ? '追加' : '更新'}しました: ${key} → ${reading}`);
}
