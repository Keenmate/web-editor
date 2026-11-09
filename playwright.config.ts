import { definePlaywrightConfig, devices } from '@keenmate/web-components-devkit/playwright';

// Specs in e2e/ target fixture pages under test/*.html on kmwc.ports.dev.
// Chromium + Firefox + WebKit (the suite rule); run WebKit in its own invocation on
// Windows (`--project=webkit`) — its workers can hang a combined run after the last test.
const viewport = { width: 1440, height: 1024 };
export default definePlaywrightConfig({
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
        { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } },
    ],
});
