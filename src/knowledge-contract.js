/** Host 与浏览器从同一声明取得严格 Remote 编解码；不暴露 agent 或执行器参数。 */
export function knowledgeContract(z) {
  const text = z.string();
  const notePath = text.min(1).max(240);
  const count = z.number().int().nonnegative();
  const hash = text;
  const input = z.discriminatedUnion('action', [
    ...['status', 'initialize', 'validate'].map(action => z.strictObject({ action: z.literal(action) })),
    z.strictObject({ action: z.literal('search'), query: text.max(200).optional() }),
    z.strictObject({ action: z.literal('browse'), directory: text.max(240).optional(), offset: count.optional() }),
    ...['read', 'document'].map(action => z.strictObject({ action: z.literal(action), path: notePath })),
    z.strictObject({ action: z.literal('write'), path: notePath, content: text.max(1048576), expectedHash: hash }),
    ...['remove', 'restore'].map(action => z.strictObject({ action: z.literal(action), path: notePath, expectedHash: hash })),
    z.strictObject({ action: z.literal('graph'), path: notePath.optional(), query: text.max(200).optional(), offset: count.optional() }),
    z.strictObject({ action: z.literal('question'), question: text.trim().min(1).max(4000), paths: z.array(notePath).max(12) }),
  ]);
  const note = z.strictObject({ path: text, content: text, hash, readOnly: z.boolean() });
  const link = z.strictObject({ kind: z.enum(['wiki', 'markdown']), label: text, target: text, line: count, status: z.enum(['resolved', 'missing', 'attachment', 'ambiguous', 'fragment_missing', 'fragment_ambiguous', 'invalid']), candidates: z.array(text), candidateTotal: count.optional(), path: text.optional(), targetLine: count.optional(), missingId: text.optional(), missingTitle: text.optional() });
  const view = z.lazy(() => z.strictObject({ type: z.enum(['root', 'group', 'paragraph', 'heading', 'text', 'blockquote', 'code', 'inlineCode', 'strong', 'emphasis', 'delete', 'list', 'listItem', 'thematicBreak', 'break', 'table', 'tableRow', 'tableCell', 'footnoteDefinition', 'link', 'knowledgeLink']), line: count, value: text.optional(), level: z.number().int().min(1).max(6).optional(), ordered: z.boolean().optional(), start: count.optional(), checked: z.boolean().optional(), url: text.optional(), index: count.optional(), children: z.array(view).optional() }));
  // 版本属于整张图，空节点列表也必须拒收不带类型与连接度语义的旧响应。
  const graphResult = z.strictObject({ version: z.literal(2), nodes: z.array(z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('note'), path: text, title: text, degree: count, readOnly: z.boolean() }),
    z.strictObject({ kind: z.literal('missing'), path: text.regex(/^missing:(?:name|path):.+/), title: text, degree: count, sources: z.array(z.strictObject({ path: text, title: text, line: count })).min(1) }),
  ])), edges: z.array(z.strictObject({ source: text, target: text })), total: count, offset: count, truncated: z.boolean(), omittedEdges: count, unresolved: count });
  const result = z.union([
    z.strictObject({ version: text, initialized: z.boolean(), root: text, skillsDir: text, limits: z.record(text, z.number()), scheduleAvailable: z.boolean(), locationNotice: text.optional() }),
    z.strictObject({ directory: text, folders: z.array(z.strictObject({ path: text, name: text })), notes: z.array(z.strictObject({ path: text, title: text, readOnly: z.boolean() })), total: count, offset: count, truncated: z.boolean() }),
    z.strictObject({ notes: z.array(z.object({ path: text, title: text, type: text, status: text, excerpt: text, hash, readOnly: z.boolean(), issue: text.optional() })), truncated: z.boolean(), total: count }),
    note,
    z.strictObject({ path: text, hash }), z.strictObject({ path: text, removed: z.literal(true) }),
    z.strictObject({ valid: z.boolean(), issues: z.array(text), notes: count }),
    note.extend({ view, links: z.array(link), anchors: z.array(z.strictObject({ kind: z.enum(['heading', 'block']), value: text, line: count })), backlinks: z.array(z.strictObject({ path: text, title: text, line: count })), totalBacklinks: count, relationsIssue: text.optional() }),
    graphResult,
    z.strictObject({ prompt: text, sources: z.array(z.strictObject({ path: text, absolutePath: text, hash })) }),
  ]);
  const packageName = 'dsh-whalewing';
  const descriptor = {
    id: `${packageName}#whalewingKnowledge/manage`, service: 'whalewing', namespace: 'whalewingKnowledge', method: 'manage', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#KnowledgeInput`, create: () => input } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#KnowledgeResult`, create: () => result },
  };
  return { input, result, graphResult, view, host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
