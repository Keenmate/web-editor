import { describe, it, expect } from 'vitest';
import { Schema } from 'prosemirror-model';
import { schema } from '../../src/schema';
import { createEditorState, createDefaultDoc } from '../../src/editor';

describe('schema', () => {
  it('is a ProseMirror schema', () => {
    expect(schema).toBeInstanceOf(Schema);
  });

  it('defines the core block nodes', () => {
    for (const name of ['doc', 'paragraph', 'heading', 'code_block', 'table', 'image']) {
      expect(schema.nodes[name], name).toBeTruthy();
    }
  });

  it('defines the core marks', () => {
    for (const name of ['bold', 'italic', 'underline', 'link', 'code']) {
      expect(schema.marks[name], name).toBeTruthy();
    }
  });
});

describe('editor state', () => {
  it('builds a default document', () => {
    const doc = createDefaultDoc();
    expect(doc.type.name).toBe('doc');
    expect(doc.childCount).toBeGreaterThan(0);
  });

  it('creates a state with the core plugin stack', () => {
    const state = createEditorState();
    expect(state.doc.type.name).toBe('doc');
    expect(state.plugins.length).toBeGreaterThan(0);
  });
});
