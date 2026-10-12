import { defineComponentConfig } from '@keenmate/web-components-devkit/vite';

// Ports, the library build (dist/web-editor.js + .umd.js + style.css + rolled-up
// .d.ts), build-time constants and the examples site come from package.json#kmwc.
// ProseMirror, Prism and floating-ui are bundled into the package (like
// web-multiselect bundles floating-ui); revisit externalizing ProseMirror once
// consumers that already depend on it appear.
export default defineComponentConfig();
