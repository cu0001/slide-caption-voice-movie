import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests',globalSetup:'./tests/global-setup.ts',timeout:120000,workers:1,
 use:{channel:'chrome',headless:true,baseURL:'http://127.0.0.1:5187',viewport:{width:1440,height:1100}},
 // Always use this checkout, never a different app already listening on the dev port.
 webServer:{command:'npm run audit:dependencies && vite --config vite.test.config.ts --host 127.0.0.1 --port 5187 --strictPort',url:'http://127.0.0.1:5187',reuseExistingServer:false,env:{IRODORI_URL:'http://127.0.0.1:5188',IRODORI_VOICE:'none',IRODORI_SPEED:'',IRODORI_CAPTION:'',IRODORI_API_KEY:'',VOICE_CACHE_DIR:'test-results/voice-cache'}},
});
