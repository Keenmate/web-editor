import { blissAnalyzerConfig } from '@keenmate/web-components-core/cem';
import { customElementVsCodePlugin } from 'custom-element-vs-code-integration';
import { customElementJetBrainsPlugin } from 'custom-element-jet-brains-integration';

/**
 * Custom Elements Manifest (custom-elements-manifest.md). Core's
 * blissAnalyzerConfig() reads the `static inputs` / `static events` tables
 * straight from the AST, so attributes, properties and events in
 * custom-elements.json come from the same table the runtime uses; the editor
 * plugins then emit vscode.html-custom-data.json / vscode.css-custom-data.json /
 * web-types.json. (No component-variables.manifest.json yet, so no CSS-variable
 * plugin — add cssVariablesFromManifestPlugin() together with the manifest.)
 */
export default blissAnalyzerConfig({
  globs: ['src/**/*.ts'],
  exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.d.ts', 'src/index.ts', 'src/dev/**'],
  outdir: '.',
  plugins: [
    customElementVsCodePlugin({ outdir: '.' }),
    customElementJetBrainsPlugin({ outdir: '.', packageJson: false }),
  ],
});
