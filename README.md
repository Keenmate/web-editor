# KeenMate Web Editor

A framework-agnostic WYSIWYG / Markdown editor, built on
[ProseMirror](https://prosemirror.net/) and delivered as a Web Component on the
shared `@keenmate/web-components-core` runtime — the same model as the rest of
the KeenMate component line.

> **Status: Phase 0.** The monorepo is scaffolded and the original `web-wysiwyg`
> POC has been ported to TypeScript modules. The `<km-editor>` Web Component and
> the HTML/Markdown/JSON serialization API land in Phases 1–2. See
> [`PLAN.md`](./PLAN.md).

## Monorepo layout

| Package | Description |
| --- | --- |
| [`packages/editor`](./packages/editor) — `@keenmate/web-editor` | Editor engine + (upcoming) `<km-editor>` element |

## Develop

```bash
npm install                 # from the repo root (npm workspaces)
npm run dev                 # dev playground for @keenmate/web-editor (Vite)
npm run build               # build all packages
npm test                    # run unit tests
```

Per package:

```bash
npm run dev        -w @keenmate/web-editor
npm run build      -w @keenmate/web-editor
npm run test:unit  -w @keenmate/web-editor
```

## License

MIT © Keenmate s.r.o.
