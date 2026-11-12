import { defineConfig, devices } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',retries:0,use:{...devices['Desktop Chrome'],trace:'retain-on-failure'},projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844}}}]});
