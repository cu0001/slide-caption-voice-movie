# Third-party notices — スライド動画作成ツール 1.0.0

Original application code, the original SVG demo artwork, and the synthesized demo WAV (`public/demo.wav`): MIT. See LICENSE. Narration made with Irodori-TTS and the projects made from users' PDFs are not part of this repository or the built application (see "Narration" and "User projects" below).

## Runtime code shipped in the JavaScript bundle

| Package | Pinned version | License | Original source |
| --- | --- | --- | --- |
| react | 19.2.0 | MIT | https://github.com/facebook/react/tree/v19.2.0 |
| react-dom | 19.2.0 | MIT | https://github.com/facebook/react/tree/v19.2.0 |
| scheduler | 0.27.0 | MIT | https://github.com/facebook/react |
| mediabunny | 1.62.1 | MPL-2.0 | https://github.com/Vanilagy/mediabunny |

The original license/copyright texts supplied by these packages are retained in `licenses/` next to this notice in the built app (or `docs/licenses/` in the source project). They are incorporated by reference and must accompany redistributions. The application's MIT license does not replace those licenses.

## Mediabunny corresponding source

No Mediabunny source files have been modified. A complete copy of the package's original TypeScript source is included with the built application under `licenses/source/mediabunny-1.62.1/src/`, together with its original LICENSE and package.json. For example, `licenses/source/mediabunny-1.62.1/src/index.ts` is directly accessible from the same server as the application. Recipients may use, modify and redistribute those files subject to MPL-2.0. Keep that source copy and this notice when redistributing the built application, and do not impose restrictions that limit recipients' MPL rights.

The identical pinned package source can also be downloaded without charge:
https://registry.npmjs.org/mediabunny/-/mediabunny-1.62.1.tgz

MPL license and FAQ: https://www.mozilla.org/MPL/2.0/ and https://www.mozilla.org/MPL/2.0/FAQ/

## Build and test dependencies

`dependency-licenses.json` lists installed packages, versions, declared licenses, original source locations and supplied license/NOTICE files. The source-project copy is at `docs/dependency-licenses.json`. Development dependencies are not shipped as executables in the static application. The project ZIP excludes node_modules. Users install pinned dependencies from npm with `npm ci`.

## Browser media facilities

The app encodes only WebM with VP8 video and Opus audio using native WebCodecs. The app does not bundle libvpx, libopus, a browser, a native encoder, a WASM encoder or FFmpeg. Copyright licenses and patent licensing are separate. The browsers' implementations and their applicable terms remain the browser vendors' responsibility; this statement does not grant additional codec patent rights.

WebM's public software, bitstream and patent terms: https://www.webmproject.org/license/

Opus's public copyright and patent terms: https://www.opus-codec.org/license/

These grants do not prove the absence of all third-party claims. See CODEC_POLICY.md for scope and official sources. Fonts, user-provided media, and the system browser retain their own terms.

## Not used

Remotion, HyperFrames, FFmpeg and ffmpeg.wasm are not dependencies of this application, and no MP4 / H.264 / H.265 / AAC / MP3 encoder or output path is included. `npm run audit:dependencies` fails if any of them appears.

## PDF functionality

PDF.js (`pdfjs-dist` 6.4.299): Apache-2.0. https://github.com/mozilla/pdf.js . The unmodified browser library and worker are shipped; the worker's copyright banner and full Apache license are retained.

pdf-lib 1.17.1 and its standard-font metrics/UPNG helpers: MIT. https://github.com/Hopding/pdf-lib . The app uses the PNG embedding and document creation APIs; the generated sample PDF embeds rasterized pages, not system font files.

Pako: MIT AND Zlib. Tslib: 0BSD. Exact dependency versions and supplied notices are in dependency-licenses.json and licenses/.

The copied PDF.js CMaps carry Adobe's BSD-style notice, retained as `licenses/pdfjs-assets/LICENSE_CMAPS`. The JS fallbacks for JPEG 2000 and JBIG2 have the BSD/Apache notices retained in the same directory. These notices are also copied beside those assets in `pdf-assets/`.

PDF parsing uses `useWasm:false`. The package's WASM binaries and Liberation/Foxit font binaries are not copied into the application distribution. The optional Node Canvas binaries are not used or shipped in the static app. The npm package includes unused assets under their own terms; installing that package does not mean this application redistributes all of those assets. The dependency audit separately records those unused PDF WASM files and rejects any other unexpected WASM. Original package sources: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.4.299.tgz and https://registry.npmjs.org/pdf-lib/-/pdf-lib-1.17.1.tgz .

## Element animation

The element model, editor, animation presets, layer renderer and reconstructed sample are original application code/assets under the application MIT license. No new third-party animation library or codec is introduced. The coffee SVG primitives are reused from the original sample owned by this project.

## Motion, captions and branding

These parts use no runtime dependency, codec, font file or third-party asset beyond those listed above. They are original application code/assets under the application MIT license.

- Element motion: the spring easing is an original implementation of the standard closed-form damped harmonic oscillator, written for this application. It is described in the README as similar in spirit to Remotion's `spring()`; no Remotion code, package or asset is used. Exit animations and idle loops are original code.
- Captions: caption timing (`src/captions.ts`), rendering and editor are original code. Captions are drawn as pixels into video frames with the system's installed fonts; no font file is copied, embedded or redistributed.
- Command-line workflow scripts: `scripts/pdf-project.mjs`, `scripts/captions-export.mjs`, `scripts/captions-apply.mjs`, `scripts/voice-generate.mjs`, `scripts/reading.mjs`, `scripts/video-export.mjs`, `scripts/video-check.mjs`, `scripts/pixel-colors.mjs` and `scripts/app-session.mjs` are local tools that run the application's own code. They use Vite and Playwright (Apache-2.0, NOTICE retained in `licenses/`) with the locally installed Google Chrome, and are not part of the static application. `video-check.mjs` reads exported WebM files with the same unmodified Mediabunny package (no FFmpeg or ffprobe), and `pixel-colors.mjs` decodes slide images with Chrome's canvas. The project skill `.claude/skills/slide-caption-voice-movie/SKILL.md` is original documentation.
- Narration: `voice/irodori.js`, `voice/speechWav.js`, `voice/googleAuth.js`, `voice/readings.js`, `scripts/reading.mjs` and the reading dictionary `voice/readings.json` are taken from the same author's ai-slide-motion-studio (MIT, Copyright (c) 2026 cu0001). They call a user-run [Irodori-TTS-Server](https://github.com/Aratako/Irodori-TTS-Server) (MIT) over HTTP; no Irodori-TTS code, model weights, codec or text encoder is included or redistributed. The server is expected to run a model such as `Aratako/Irodori-TTS-v4.1-Small` with the `Aratako/Semantic-DACVAE-Japanese-32dim` codec, both published under MIT on Hugging Face. The model card adds ethical-use conditions: do not clone or imitate a person's voice without their explicit consent, and do not use the output for deepfakes or misleading synthetic speech. Its output carries an inaudible SilentCipher watermark. Users are responsible for the terms of the model they run and for consent to any reference voice they register (`IRODORI_VOICE`). The narration WAV is embedded in the user's project and exported video; it is not shipped with this application.
- User projects: `npm run startup:set` writes the project the app opens at startup to `public/examples/startup/`. That project contains the user's PDF pages as images and, when narrated, the synthesized narration, so the folder is excluded from Git (`.gitignore`) and removed from `dist/` by `npm run build`. Do not commit or redistribute it unless you hold the rights to the PDF and the voice.
- Element sample generator: `scripts/generate-element-sample.py` synthesizes its chord bed with Python's standard library, like the original demo WAV.
- Logo and favicon (`public/favicon.svg`): original SVG artwork of a spring curve, created for this project.

Users remain responsible for the rights to their own PDFs, images, audio and caption text, including text drafted with an AI service under that service's terms.
