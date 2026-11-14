import {defineConfig} from 'vite';
// @ts-expect-error plain JavaScript that runs only in the dev server
import {voiceServer} from './voice/devServer.js';
export default defineConfig({
 cacheDir:'node_modules/.vite-tests',
 plugins:[voiceServer()],
 // Tests import PDF tools dynamically. Pre-bundle them before navigation to avoid mid-test reloads.
 optimizeDeps:{include:['pdfjs-dist','pdf-lib','mediabunny']},
});
