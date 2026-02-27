// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/smoke',
    timeout: 120000,
    expect: {
        timeout: 10000
    },
    use: {
        baseURL: 'http://127.0.0.1:4173'
    },
    webServer: {
        command: 'node tests/support/static-server.js 4173',
        url: 'http://127.0.0.1:4173/index.html',
        reuseExistingServer: true,
        timeout: 120000
    }
});
