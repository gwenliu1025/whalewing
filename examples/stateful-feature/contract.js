import { z } from 'zod';
import { packageName } from './identity.js';

// 服务与数据身份随包名稳定派生，不要求作者在 Host/Client 手改第二份名字。
export const namespace = 'savedText_' + [...packageName].map(char => char.codePointAt(0).toString(16)).join('_');
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
export const state = z.strictObject({ revision, text: z.string().max(4000), present: z.boolean() })
  .refine(value => value.present ? value.text.trim().length > 0 : value.text === '', '保存状态不一致');
export const input = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('read') }),
  z.strictObject({ action: z.literal('save'), expectedRevision: revision, text: z.string().trim().min(1).max(4000) }),
  z.strictObject({ action: z.literal('purge'), expectedRevision: revision, confirmation: z.literal('DELETE_SAVED_TEXT') }),
]);
const descriptor = {
  id: `${packageName}#${namespace}/manage`, service: namespace, namespace, method: 'manage', invocation: { kind: 'direct' },
  parameters: [{ name: 'input', wire: 'input', source: 'json', codec: { mode: 'strict', typeSymbol: `${packageName}#Input`, create: () => input } }],
  cancellation: { parameter: 'signal' }, result: { mode: 'strict', typeSymbol: `${packageName}#State`, create: () => state },
};
export const contract = {
  host: { package: packageName, face: 'host', schemas: [], invocations: [descriptor], model: { package: packageName, face: 'host' } },
  client: { package: packageName, descriptors: [descriptor] },
};
