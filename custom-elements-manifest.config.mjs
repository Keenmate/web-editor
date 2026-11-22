import { blissAnalyzerConfig, cssVariablesFromManifestPlugin } from '@keenmate/web-components-core/cem';
import { customElementVsCodePlugin } from 'custom-element-vs-code-integration';
import { customElementJetBrainsPlugin } from 'custom-element-jet-brains-integration';

/**
 * Custom Elements Manifest (custom-elements-manifest.md). Core's
 * blissAnalyzerConfig() reads the `static inputs` / `static events` tables
 * straight from the AST, so attributes, properties and events in
 * custom-elements.json come from the same table the runtime uses; the editor
 * plugins then emit vscode.html-custom-data.json / vscode.css-custom-data.json /
 * web-types.json.
 *
 * Core's `cssVariablesFromManifestPlugin()` runs before the editor-integration
 * generators and injects the `--we-*` surface (from
 * `component-variables.manifest.json`) as `cssProperties`, so both the VS Code
 * CSS custom-data file and `web-types.json` carry the theming variables.
 */
export default blissAnalyzerConfig({
  globs: ['src/**/*.ts'],
  exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.d.ts', 'src/dev/**'],
  outdir: '.',
  plugins: [
    cssVariablesFromManifestPlugin(),
    customElementVsCodePlugin({ outdir: '.' }),
    customElementJetBrainsPlugin({ outdir: '.', packageJson: false }),
  ],
});
