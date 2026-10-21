/** 输入、存储与客户端读回共享入口字段和 URL 校验。 */
export function aiWebContract(z) {
  const text = z.string(), id = text.regex(/^(?:[a-z][a-z0-9-]{0,79})$/);
  const url = text.trim().min(1).max(2048).refine(value => {
    try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password && !/[\u0000-\u0020\u007f]/u.test(value); }
    catch { return false; }
  }, '网址须为不含账号密码的完整 HTTP 或 HTTPS 地址').transform(value => new URL(value).href);
  const fields = z.strictObject({ name: text.trim().min(1).max(80), url, description: text.trim().max(400).default(''), avatar: text.max(700000).nullable().default(null) });
  const revision = z.number().int().nonnegative();
  const entry = fields.extend({ id, revision, builtin: z.boolean(), provider: text.max(100), keywords: text.max(400) });
  const input = z.discriminatedUnion('action', [z.strictObject({ action: z.literal('list') }),
    z.strictObject({ action: z.literal('save'), id: text.regex(/^custom-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), expectedRevision: revision, entry: fields }),
    z.strictObject({ action: z.literal('remove'), id, expectedRevision: revision })]);
  const result = z.strictObject({ entries: z.array(entry).max(210) });
  const packageName = 'dsh-whalewing/ai-web';
  const descriptor = { id: `${packageName}#whalewingAiWeb/manageAiWeb`, service: 'whalewingAiWeb', namespace: 'whalewingAiWeb', method: 'manageAiWeb', invocation: { kind: 'direct' }, parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#AiWebInput`, create: () => input } }], cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#AiWebResult`, create: () => result } };
  return { input, result, stored: entry.extend({ builtin: z.literal(false) }), host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors: [descriptor] } };
}
