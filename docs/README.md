# Documentation

Guides for `@keenmate/web-editor`. (Install and the quick start are in the root
[`README.md`](../README.md).)

- **[Usage](./usage.md)** — the full API: attributes, properties, events, methods, labels, forms,
  responsive rules, extending (plugins, toolbar items, icons), and the headless `EditorEngine`
  (build your own toolbar / menus / status line).
- **[Examples](./examples.md)** — every example page and its sections, one line each.
- **[Accessibility](./accessibility.md)** — keyboard map, roles / ARIA, accessible names, focus,
  reduced motion.
- **[Theming](./theming.md)** — dark mode, `--we-*` / `--base-*` variables, custom CSS in the shadow root,
  the loader, motion, the context-menu properties.
- **[Pipelines](./pipelines/README.md)** — how the editor runs everything a user
  can trigger: the stage/context model, `sync` vs `deferred` execution, the async
  machinery (abort / supersede / lock / interaction host), and how plugins
  contribute and reshape pipelines. Diagrams included.

See also the root [`PIPELINES.md`](../PIPELINES.md) (the full design note, including
design-stage work) and [`PLAN.md`](../PLAN.md) (the phased roadmap).
