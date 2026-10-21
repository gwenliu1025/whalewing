/** 登记快照与订阅共用同一严格结构，不把宿主fiber或路径缓存当作独立身份。 */
export function workbenchContract(z) {
  const feature = z.strictObject({
    id: z.string(), kind: z.enum(['base', 'optional', 'extension']), api: z.literal(1), package: z.string(), skills: z.array(z.string()),
    tab: z.strictObject({ placement: z.literal('end').optional(), keepAlive: z.literal(true).optional(), icon: z.string().optional() }).optional(), error: z.string().optional(),
    instance: z.number().int().positive().optional(),
  }).refine(value => value.instance !== undefined || value.kind === 'base' && Boolean(value.error), '活动功能必须带有本轮登记实例');
  const snapshot = z.strictObject({ revision: z.number().int().min(0), features: z.array(feature) });
  const packageName = 'dsh-whalewing';
  const descriptors = ['features', 'watchFeatures', 'retryBase'].map(method => ({
    id: `${packageName}#whalewingWorkbench/${method}`, service: 'whalewing', namespace: 'whalewingWorkbench', method, invocation: { kind: 'direct' },
    ...(method === 'watchFeatures' ? { mode: 'stream' } : {}),
    parameters: method === 'retryBase' ? [{ name: 'id', wire: 'id', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#FeatureId`, create: () => z.string().min(1).max(80) } }] : [],
    ...(method === 'watchFeatures' ? { cancellation: { parameter: 'signal' } } : {}),
    result: { mode: 'strict', typeSymbol: `${packageName}#Features`, create: () => snapshot },
  }));
  return { snapshot, host: { package: packageName, face: 'host', schemas: [], invocations: descriptors, model: { package: packageName, face: 'host' } }, client: { package: packageName, descriptors } };
}
