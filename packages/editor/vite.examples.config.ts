import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

/**
 * Multi-page build for the static examples site (Docker / nginx).
 *
 * The example pages reference the TS source directly (`/src/index.ts`, the dev
 * harnesses `/src/dev/*.ts`, and `/src/css/editor.css` + `/src/dev/playground.css`)
 * so `vite dev` serves them with on-the-fly transpilation. A plain static server
 * can't do that, so here we run a normal (MPA) Vite build: every `*.html` is an
 * entry, Vite bundles its TS + resolves `?inline` CSS + rewrites every asset path,
 * and emits a self-contained static site in `dist-examples/`.
 *
 * This is SEPARATE from the library build (`vite.config.ts`, lib mode) — that one
 * ships `dist/` (the component). This one ships the demo site only.
 */
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  // Build-time constants the component source expects (mirrors vite.config.ts).
  define: {
    __VERSION__: JSON.stringify(pkg.version),
    __PACKAGE_NAME__: JSON.stringify(pkg.name),
    __AUTHOR__: JSON.stringify(pkg.author),
    __LICENSE__: JSON.stringify(pkg.license),
    __REPOSITORY__: JSON.stringify(pkg.repository.url),
    __HOMEPAGE__: JSON.stringify(pkg.homepage),
  },
  build: {
    outDir: 'dist-examples',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        basic: resolve(__dirname, 'examples-basic.html'),
        plugins: resolve(__dirname, 'examples-plugins.html'),
        phases: resolve(__dirname, 'examples-phases.html'),
        imageCases: resolve(__dirname, 'examples-image-cases.html'),
        pipelines: resolve(__dirname, 'examples-pipelines.html'),
        playground: resolve(__dirname, 'examples-playground.html'),
      },
    },
  },
});
