import { defineConfig } from 'vitest/config';

/**
 * Unit specs live in test/unit/*.test.ts and exercise the editor logic in a
 * lightweight DOM (happy-dom) without a real browser. Broader interaction /
 * visual behaviour will live in a Playwright e2e suite later (parity with
 * web-multiselect).
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/unit/**/*.test.ts'],
    globals: true,
  },
  define: {
    __VERSION__: JSON.stringify('test'),
    __PACKAGE_NAME__: JSON.stringify('@keenmate/web-editor'),
    __AUTHOR__: JSON.stringify('test'),
    __LICENSE__: JSON.stringify('MIT'),
    __REPOSITORY__: JSON.stringify('test'),
    __HOMEPAGE__: JSON.stringify('test'),
  },
});
