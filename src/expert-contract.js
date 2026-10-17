/** 专家配置的 Host、浏览器与持久记录共用同一严格声明。 */
export function expertContract(z) {
  const text = z.string();
  const id = text.regex(/^[a-z][a-z0-9-]{0,79}$/);
  const revision = z.number().int().nonnegative();
  const model = z.strictObject({ provider: text.min(1).max(120), model: text.min(1).max(160), reasoningEffort: text.max(80).optional() });
  const fields = z.strictObject({ name: text.trim().min(1).max(40), description: text.trim().min(1).max(240), avatar: text.max(700000).nullable(), prompt: text.trim().min(1).max(32000), model: model.nullable(), skills: z.array(text.min(1).max(100)).max(40), mcpServers: z.array(text.min(1).max(32)).max(30) });
  const expert = fields.extend({ id, revision, builtin: z.boolean() });
  const deleted = z.strictObject({ id, name: text, revision, builtin: z.boolean() });
  const input = z.discriminatedUnion('action', [
    z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('catalog'), sessionId: text.min(1).max(160).optional() }),
    z.strictObject({ action: z.literal('prepare_model'), sessionId: text.min(1).max(160), expertId: id, expectedRevision: revision }),
    z.strictObject({ action: z.literal('save'), id: id.optional(), expectedRevision: revision, expert: fields }),
    ...['remove', 'restore'].map(action => z.strictObject({ action: z.literal(action), id, expectedRevision: revision })),
  ]);
  const modelItem = z.object({ id: text, name: text, description: text.optional(), reasoning: z.object({ efforts: z.array(z.object({ id: text, name: text, description: text.optional() })), defaultEffort: text.optional() }).optional() });
  const result = z.union([
    z.strictObject({ experts: z.array(expert), deleted: z.array(deleted) }),
    z.strictObject({ models: z.array(z.object({ id: text, name: text, models: z.array(modelItem) })), defaultModel: model.nullable(), skills: z.array(z.strictObject({ name: text, description: text })), mcpServers: z.array(z.strictObject({ name: text, connected: z.boolean(), tools: z.array(text) })), issues: z.array(text), mcpSupported: z.boolean().optional(), modelSupported: z.boolean().optional() }),
    z.strictObject({ selected: model, applied: z.boolean().optional() }),
    z.strictObject({ expert }), z.strictObject({ id, revision, deleted: z.literal(true) }),
  ]);
  const packageName = 'dsh-whalewing/experts';
  const descriptor = { id: `${packageName}#whalewingExperts/manage`, service: 'whalewingExperts', namespace: 'whalewingExperts', method: 'manage', invocation: { kind: 'direct' }, parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#ExpertInput`, create: () => input } }], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#ExpertResult`, create: () => result } };
  return { input, result, fields, expert, stored: expert.extend({ deleted: z.boolean() }), host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
