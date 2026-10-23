import { defineConfig } from '@playwright/test';
const base=process.env.NEXT_PUBLIC_BASE_PATH??'';
export default defineConfig({
  testDir:'./tests/performance',workers:1,retries:0,timeout:90_000,
  reporter:[['list']],
  use:{baseURL:`http://127.0.0.1:3199${base}/`,browserName:'chromium',
    launchOptions:{args:['--enable-unsafe-swiftshader']}},
  webServer:{command:'node scripts/serve-export.mjs',url:`http://127.0.0.1:3199${base}/`,reuseExistingServer:false},
});
