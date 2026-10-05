import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import dts from 'vite-plugin-dts';

// Read package.json for build-time constants (mirrors the KeenMate component line).
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [
    dts({ include: ['src'], exclude: ['src/dev', 'test'] }),
  ],
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __PACKAGE_NAME__: JSON.stringify(pkg.name),
    __AUTHOR__: JSON.stringify(pkg.author),
    __LICENSE__: JSON.stringify(pkg.license),
    __REPOSITORY__: JSON.stringify(pkg.repository.url),
    __HOMEPAGE__: JSON.stringify(pkg.homepage),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WebEditor',
      formats: ['es', 'umd'],
      fileName: (format) => `web-editor.${format === 'es' ? 'js' : 'umd.js'}`,
    },
    rollupOptions: {
      // Phase 0: bundle everything (ProseMirror, Prism, floating-ui) into the
      // package, like web-multiselect bundles floating-ui. Revisit externalizing
      // ProseMirror once consumers that already depend on it appear.
      external: [],
      output: { globals: {} },
    },
  },
});
