'use strict';
const path = require('node:path');
const PROJECT = 'demo-orderfly-qa0';
function environment() {
  // Child allowlist: never inherit ADC, service accounts, cloud/provider keys or proxies.
  return {
    PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC', NODE_ENV: 'development',
    ORDERFLY_LOCAL_QA: 'true', NEXT_PUBLIC_ORDERFLY_LOCAL_QA: 'true', GCLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_PROJECT: PROJECT,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT, NEXT_PUBLIC_FIREBASE_API_KEY: 'qa0-public-only',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '127.0.0.1', NEXT_PUBLIC_FIREBASE_APP_ID: 'qa0-local',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    SITE_URL: 'http://127.0.0.1:3100', NEXT_TELEMETRY_DISABLED: '1',
    MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID: '00000000-0000-4000-8000-000000000001',
    MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000002',
    ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'true',
    NODE_OPTIONS: `--require=${path.resolve(__dirname, 'network-guard.cjs')}`,
  };
}
module.exports = { PROJECT, environment };
