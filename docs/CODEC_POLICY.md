# 映像・音声とライセンスの方針

確認日: 2026-10-26。このアプリは「MPEG系のコーデックを使わない」「FFmpegを導入・実行しない」という方針で作られています。この文書はその範囲と根拠を示します。法的な無侵害保証や特定組織の承認を表す文書ではありません。

## 使用するもの

- 出力コンテナ: WebM。
- 映像: ブラウザのWebCodecsでVP8をエンコード。
- 音声: ブラウザのWebCodecsでOpusをエンコード。音声のないプロジェクトは音声トラックを作らず、映像だけを書き出す。
- 字幕: アプリの共通描画関数で映像のフレームに描き込む。字幕用のトラックやフォントファイルは出力しない。
- 入力音声: RIFF WAVのPCM / IEEE floatのみ。独自のヘッダ検査・サンプル読み出しでAudioBufferへ変換し、ブラウザの圧縮音声デコーダーを呼び出さない。
- 画像: PNG/JPEG/WebP、プロジェクト内のSVG。これらの形式とMPEG動画コーデックは区別する。
- フレーム描画とプレビュー: アプリ独自のCanvas/Web Audioの時間軸。Remotion / HyperFramesは使用しない。
- コンテナ生成: Mediabunny 1.62.1（無改変、MPL-2.0）。

MP4 / H.264 / H.265 / AAC / MP3の出力経路や自動フォールバックはありません。MPEG音声が埋め込まれた既存プロジェクトは読み込みを拒否します。WAVという拡張子やMIMEだけでは判断せず、圧縮WAV、偽装MP3、未対応のWAV subtypeも拒否します。入力に使うPDFや画像・音声素材の権利は別途必要です。

## コーデックの公式資料

WebMはソフトウェア、ビットストリーム仕様、特許許諾を別の文書で公開しています。GoogleのAdditional IP Rights GrantはGoogleが許諾可能な必要特許について無償・ロイヤルティーフリーの許諾を示し、特許訴訟に関する終了条件を含みます。Opusも公開仕様、BSDの参照実装、権利者のロイヤルティーフリー特許許諾を公開しています。これらは全世界の第三者特許の不存在を保証するものではありません。

- WebM licensing: https://www.webmproject.org/license/
- WebM Additional IP Rights Grant: https://www.webmproject.org/license/additional/
- WebM software license: https://www.webmproject.org/license/software/
- WebM bitstream specification license: https://www.webmproject.org/license/bitstream/
- Opus copyright and patent grants: https://www.opus-codec.org/license/
- W3C WebCodecs codec registry / IP caveat: https://www.w3.org/TR/webcodecs-codec-registry/#abstract

このアプリはlibvpx/libopusの実装コードを配布せず、ユーザーがインストール済みのブラウザが提供するVP8/Opus機能を使用します。そのためブラウザ・OS側の内部実装、同梱ライブラリ、EULA、フォントの条件は別の確認範囲です。ブラウザ自体からFFmpegコードを取り除くものではありません。

## ソフトウェアの配布対応

独自コード・独自デモ素材はMITです。React/React DOM/SchedulerのMIT表示、MediabunnyのMPL-2.0原文・著作権表示、開発時の依存関係のライセンス/NOTICEを保持します。MPL対象のMediabunnyは無改変で使用し、対応する全TypeScriptソースを同じ配布物の `licenses/source/mediabunny-1.62.1/src/` に同梱します。元のnpmソースアーカイブと公開リポジトリも案内します。アプリはこの案内をフッターから表示できます。

`npm run audit:dependencies` はlockfileとインストール済みパッケージの両方について、FFmpeg、Remotion、HyperFrames、一部の追加音声エンコーダー、許可していないWASMファイル、未確認のライセンス種別の混入を検出して停止します。`npm run build` の際にもこの監査を実行し、原文・ソース案内を静的配布物へ同梱します。実行時のエンコーダー設定がVP8/Opusのみであることと、書き出したファイルの実際のコーデックをChromeテストで照合します。

## PDF機能の配布範囲

PDF.js 6.4.299（Apache-2.0）とpdf-lib 1.17.1（MIT）を使います。これらは動画コーデックではありません。PDF.jsは `useWasm:false` で動かし、worker、CMaps、JSデコーダーを列挙して配布します。必要なBSD/Apacheのライセンス原文を同梱しています。PDF処理で使うPakoのMIT/Zlib原文も同梱します。

インストールするpdfjs-distには未使用の画像処理用WASMとフォントファイルも含まれますが、WASM・フォントバイナリ・Node専用Canvasは静的配布物へコピーしません。監査ではPDF.js配下の既知の未使用WASMを別記し、それ以外のWASMを拒否します。動画エンコード用WASMやFFmpegの許可を緩めるものではありません。ソースZIPからもnode_modulesを除外します。

PDF保存ではページを描画したPNGを埋め込み、システムのフォントファイルを複製・再配布しません。利用者が提供するPDFの埋め込み素材・フォント等の権利確認は別途必要です。
