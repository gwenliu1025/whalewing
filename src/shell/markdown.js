/** 只渲染 Host 已解析的节点；链接动作由对应页面提供。 */
export function createMarkdown(h, { busy = false, dirty = false, openLink = () => {} } = {}) {
  const markdown = (node, index = 0) => {
      if (!node) return null;
      const props = { key: index, 'data-note-line': node.line };
      const children = node.children?.map(markdown);
      if (node.type === 'text') return node.value;
      if (node.type === 'knowledgeLink') return h('button', { ...props, type: 'button', disabled: busy || dirty, onClick: () => openLink(`whalewing-link/${node.index}.md`) }, node.value);
      if (node.type === 'link') return /^(?:https?:\/\/|mailto:)/i.test(node.url) ? h('a', { ...props, href: node.url, target: '_blank', rel: 'noreferrer noopener' }, node.value) : node.value;
      if (node.type === 'heading') return h(`h${node.level}`, props, children);
      if (node.type === 'code') return h('pre', props, h('code', null, node.value));
      if (node.type === 'inlineCode') return h('code', props, node.value);
      if (node.type === 'list') return h(node.ordered ? 'ol' : 'ul', { ...props, ...(node.ordered ? { start: node.start } : {}) }, children);
      if (node.type === 'listItem') return h('li', props, typeof node.checked === 'boolean' && h('input', { type: 'checkbox', checked: node.checked, disabled: true }), children);
      if (node.type === 'table') return h('div', { ...props, className: 'yj-table' }, h('table', null,
        h('thead', null, h('tr', null, ...node.children[0].children.map((cell, i) => h('th', { key: i, scope: 'col' }, cell.children.map(markdown))))), h('tbody', null, children.slice(1))));
      const tags = { root: 'div', group: 'span', paragraph: 'p', blockquote: 'blockquote', strong: 'strong', emphasis: 'em', delete: 'del', thematicBreak: 'hr', break: 'br', tableRow: 'tr', tableCell: 'td', footnoteDefinition: 'aside' };
      const tag = tags[node.type];
      return tag ? h(tag, props, ...(tag === 'hr' || tag === 'br' ? [] : [children])) : null;
    };

  return markdown;
}
