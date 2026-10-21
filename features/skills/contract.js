/** 员工技能管理与浏览器共享唯一严格契约；模型工具不注册此管理入口。 */
export function skillLibraryContract(z) {
  const text = z.string();
  const id = text.min(1).max(300);
  const hash = text.max(64);
  const count = z.number().int().nonnegative();
  const state = z.enum(['candidate', 'active', 'disabled']);
  const input = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list'), offset: count.optional() }),
    z.strictObject({ action: z.literal('read'), id }),
    z.strictObject({ action: z.literal('create'), id, content: text.max(1048576), expectedHash: z.literal('') }),
    z.strictObject({ action: z.literal('update'), id, content: text.max(1048576), expectedHash: hash, expectedBaseHash: hash.optional() }),
    ...['remove', 'reset'].map(action => z.strictObject({ action: z.literal(action), id, expectedHash: hash, expectedBaseHash: hash.optional() })),
    z.strictObject({ action: z.literal('stage'), name: text, content: text.max(1048576), sourcePaths: z.array(text).min(1).max(20), sourceHashes: z.record(text, text), expectedHash: hash }),
    z.strictObject({ action: z.literal('publish'), name: text, expectedHash: hash, activeHash: hash, review: z.strictObject({ reviewer: text, positive: text, negative: text }) }),
    ...['disable', 'restore', 'rollback'].map(action => z.strictObject({ action: z.literal(action), name: text, expectedHash: hash })),
  ]);
  const entry = z.strictObject({
    id, name: text, description: text, origin: z.enum(['builtin', 'user', 'override', 'evolution']), hash,
    actions: z.array(z.enum(['read', 'update', 'remove', 'reset', 'evolve'])),
    discovery: z.enum(['available', 'catalogued', 'shadowed', 'unavailable', 'inactive', 'unknown']), issue: text.optional(),
    editId: id.optional(), baseId: id.optional(), baseHash: hash.optional(), state: state.optional(),
  });
  const result = z.union([
    z.strictObject({ entries: z.array(entry), offset: count, total: count, truncated: z.boolean() }),
    z.strictObject({ entry: entry.extend({ content: text, sourcePaths: z.array(text).optional() }).nullable() }),
    z.strictObject({ id, removed: z.literal(true) }),
    z.strictObject({ id, reset: z.literal(true), baseId: id }),
    z.strictObject({ name: text, state, hash, sourcePaths: z.array(text).optional(), discovery: z.literal('verified').optional(), behavior: text.optional() }),
  ]);
  const packageName = 'dsh-whalewing/skills';
  const descriptor = {
    id: `${packageName}#whalewingSkills/manageSkills`, service: 'whalewingSkills', namespace: 'whalewingSkills', method: 'manageSkills', invocation: { kind: 'direct' },
    parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#SkillLibraryInput`, create: () => input } }],
    cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#SkillLibraryResult`, create: () => result },
  };
  return { input, result, host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
