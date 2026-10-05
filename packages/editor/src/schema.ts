/**
 * Document schema — the grammar of the editor.
 *
 * Ported verbatim (behaviour-preserving) from the web-wysiwyg POC. In later
 * phases the node/mark specs move into a registry so plugins can contribute
 * their own; for now they are declared inline.
 */
import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

// Table node specs from prosemirror-tables.
const tableNodeSpecs = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    background: {
      default: null,
      getFromDOM: (dom) => dom.style.backgroundColor || null,
      setDOMAttr: (value, attrs) => {
        if (value) attrs.style = (attrs.style || '') + `background-color: ${value};`;
      },
    },
  },
});

export const schema = new Schema({
  nodes: {
    doc: {
      content: 'block+',
    },

    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },

    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
      ],
      toDOM(node) {
        return ['h' + node.attrs.level, 0];
      },
    },

    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM() {
        return ['ul', 0];
      },
    },

    ordered_list: {
      content: 'list_item+',
      group: 'block',
      attrs: { order: { default: 1 } },
      parseDOM: [{ tag: 'ol', getAttrs: (dom) => ({ order: dom.getAttribute('start') || 1 }) }],
      toDOM(node) {
        return node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0];
      },
    },

    list_item: {
      content: 'paragraph block*',
      parseDOM: [{ tag: 'li' }],
      toDOM() {
        return ['li', 0];
      },
      defining: true,
    },

    code_block: {
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      attrs: { language: { default: 'javascript' } },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: (node) => ({
            language:
              node.getAttribute('data-language') ||
              node.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] ||
              'javascript',
          }),
        },
      ],
      toDOM(node) {
        return [
          'pre',
          { 'data-language': node.attrs.language, class: `language-${node.attrs.language}` },
          ['code', { class: `language-${node.attrs.language}` }, 0],
        ];
      },
    },

    // Table nodes (from prosemirror-tables).
    ...tableNodeSpecs,

    image: {
      inline: true,
      attrs: {
        src: {},
        alt: { default: null },
        title: { default: null },
        width: { default: null },
        height: { default: null },
      },
      group: 'inline',
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom) => ({
            src: dom.getAttribute('src'),
            alt: dom.getAttribute('alt'),
            title: dom.getAttribute('title'),
            width: dom.getAttribute('width'),
            height: dom.getAttribute('height'),
          }),
        },
      ],
      toDOM(node) {
        const { src, alt, title, width, height } = node.attrs;
        const attrs: Record<string, any> = { src };
        if (alt) attrs.alt = alt;
        if (title) attrs.title = title;
        if (width) attrs.width = width;
        if (height) attrs.height = height;
        return ['img', attrs];
      },
    },

    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br'];
      },
    },

    text: {
      group: 'inline',
    },
  },

  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight=bold' }],
      toDOM() {
        return ['strong', 0];
      },
    },

    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM() {
        return ['em', 0];
      },
    },

    underline: {
      parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
      toDOM() {
        return ['u', 0];
      },
    },

    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => ({ href: dom.getAttribute('href'), title: dom.getAttribute('title') }),
        },
      ],
      toDOM(node) {
        return ['a', { href: node.attrs.href, title: node.attrs.title }, 0];
      },
    },

    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() {
        return ['code', 0];
      },
    },
  },
});
