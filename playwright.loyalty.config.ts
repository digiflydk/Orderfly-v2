import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',testMatch:'loyalty-browser.spec.ts',workers:1,retries:0,timeout:60000,
 use:{baseURL:'http://127.0.0.1:3107',trace:'retain-on-failure',launchOptions:process.env.LOYALTY_QA_LAUNCH_CONFIG?require(process.env.LOYALTY_QA_LAUNCH_CONFIG):undefined},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'node node_modules/next/dist/bin/next dev tests/loyalty-app -p 3107 -H 127.0.0.1',url:'http://127.0.0.1:3107',timeout:120000,reuseExistingServer:false,env:{LOYALTY_FINANCIAL_RULES_READY:'true'}},
});
