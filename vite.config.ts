import {defineConfig} from 'vite';
// @ts-expect-error plain JavaScript that runs only in the dev server
import {voiceServer} from './voice/devServer.js';
export default defineConfig({plugins:[voiceServer()]});
