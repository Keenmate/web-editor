/// <reference types="vite/client" />

// Prism ships no bundled types; we use it loosely (noImplicitAny is off).
declare module 'prismjs';
declare module 'prismjs/components/*';
declare module 'prismjs/themes/*';

// Build-time constants injected by vite.config.ts `define`.
declare const __VERSION__: string;
declare const __PACKAGE_NAME__: string;
declare const __AUTHOR__: string;
declare const __LICENSE__: string;
declare const __REPOSITORY__: string;
declare const __HOMEPAGE__: string;
