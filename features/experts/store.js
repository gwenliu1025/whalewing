import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { roles } from '../../content/roles.js';
import { expertContract } from './contract.js';
import { avatarLimits, assertAvatarDimensions, parseAvatarData } from '../../src/avatar-image.js';

const contract = expertContract(z);
// 专业绑定由角色持有；复制数组避免运行时默认值改写角色分发源。
const defaults = new Map(roles.map(role => [role.id, { ...role, revision: 0, builtin: true, avatar: null, model: null, skills: [...role.skills], mcpServers: [] }]));
export const expertDomain = defineDomain({ name: 'whalewing_experts', version: 1, tables: { experts: domainTable(contract.stored) } });

export function expertError(code, message) { return Object.assign(new Error(message), { code }); }

/** 只接受有界栅格数据；SVG、外部 URL 与非规范 Base64 不进入持久配置。 */
export async function validateAvatar(value) {
  if (value === null) return null;
  const parsed = parseAvatarData(value);
  const bytes = Buffer.from(parsed.bytes);
  try {
    const { default: sharp } = await import('sharp');
    // 完整解码而非仅检查文件头；限制解码像素，拒绝截断和多帧图片。
    const image = sharp(bytes, { limitInputPixels: avatarLimits.edge ** 2, failOn: 'warning' });
    const metadata = await image.metadata();
    if (`image/${metadata.format}` !== parsed.mime || (metadata.pages ?? 1) !== 1) throw new Error('头像格式不匹配或包含多帧');
    assertAvatarDimensions(metadata.width, metadata.height);
    const normalized = await image.rotate().png().toBuffer();
    if (normalized.length > avatarLimits.bytes) throw new Error('规范化后的头像超过 512 KiB');
    return `data:image/png;base64,${normalized.toString('base64')}`;
  } catch (error) { throw expertError('AVATAR', `头像未通过完整图像检查，原头像未修改：${error.message}`); }
}

/** 默认身份由内置集合持有；员工记录保存编辑值，自定义删除记录继续保留。 */
export class ExpertStore {
  constructor(domain, maxExperts) { this.domain = domain; this.table = domain.table('experts'); this.maxExperts = maxExperts; this.creating = new Set(); }
  async restoreDeletedBuiltins() {
    // 服务发布前修复旧删除标记，不重置员工编辑；失败重启只处理尚未完成的记录。
    for (const id of defaults.keys()) {
      const previous = this.table.get(id);
      if (!previous?.deleted) continue;
      await this.change(id, previous.revision, current => ({ ...current, revision: current.revision + 1, deleted: false }), true);
    }
  }
  record(id) { return this.table.get(id) ?? defaults.get(id); }
  get(id) {
    const value = this.record(id);
    if (!value || value.deleted) throw expertError('EXPERT_DELETED', '专家已删除或不存在，请恢复专家或选择其他专家');
    const { deleted: _deleted, ...expert } = value;
    return structuredClone(expert);
  }
  list() {
    const ids = new Set([...defaults.keys(), ...this.table.keys()]);
    const experts = [], deleted = [];
    for (const id of ids) {
      const value = this.record(id);
      if (value.deleted) deleted.push({ id, name: value.name, revision: value.revision, builtin: value.builtin });
      else experts.push(this.get(id));
    }
    return { experts, deleted };
  }
  /** 新建身份与版本检查在同一 owner，供管理入口的模型/绑定校验与最终提交共用。 */
  previousForSave(input) {
    if (!input.id) {
      if (input.expectedRevision !== 0) throw expertError('CONFLICT', '新增专家版本须为 0');
      return undefined;
    }
    if (this.creating.has(input.id)) throw expertError('CONFLICT', '此专家创建请求仍在保存，请按原标识刷新核对');
    const current = this.record(input.id);
    if (current) {
      if (current.revision !== input.expectedRevision) throw expertError('CONFLICT', '专家已保存或被另一处修改，请按原标识刷新核对');
      return this.get(input.id);
    }
    if (input.expectedRevision !== 0 || !/^custom-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.id)) throw expertError('EXPERT_ID', '新建专家须使用固定的 custom-UUID 标识及版本 0');
    return undefined;
  }
  async save(input, signal) {
    const fields = contract.fields.parse(input.expert);
    const previous = this.previousForSave(input);
    // 历史头像保留原字节；仅新建或替换执行新尺寸边界，改名不隐式重写头像。
    if (!previous || fields.avatar !== previous.avatar) fields.avatar = await validateAvatar(fields.avatar);
    signal?.throwIfAborted();
    this.previousForSave(input);
    fields.skills = [...new Set(fields.skills)]; fields.mcpServers = [...new Set(fields.mcpServers)];
    if (!previous) {
      if (new Set([...defaults.keys(), ...this.table.keys(), ...this.creating]).size >= this.maxExperts) throw expertError('EXPERT_LIMIT', '专家数量达到当前限制，请调整专家服务配置后重试');
      const id = input.id ?? `custom-${randomUUID()}`;
      // 身份与容量同时预留，持久化失败释放；回执丢失后同一 id 只返回冲突，不覆盖既有记录。
      this.creating.add(id);
      try { await this.table.put(id, contract.stored.parse({ ...fields, id, revision: 1, builtin: false, deleted: false })); }
      finally { this.creating.delete(id); }
      return { expert: this.get(id) };
    }
    return this.change(input.id, input.expectedRevision, current => ({ ...fields, id: current.id, builtin: current.builtin, revision: current.revision + 1, deleted: false }), false, signal);
  }
  async remove(input, signal) {
    signal?.throwIfAborted();
    if (defaults.has(input.id)) throw expertError('EXPERT_BUILTIN', '内置专家可以编辑或重置，不可删除');
    await this.change(input.id, input.expectedRevision, current => ({ ...current, revision: current.revision + 1, deleted: true }), true, signal);
    return { id: input.id, revision: this.record(input.id).revision, deleted: true };
  }
  async restore(input, signal) {
    return this.change(input.id, input.expectedRevision, current => ({ ...(defaults.get(input.id) ?? current), revision: current.revision + 1, deleted: false }), true, signal);
  }
  async change(id, expectedRevision, transform, allowDeleted = false, signal) {
    signal?.throwIfAborted();
    // 首次内置写入也通过同一记录的 update 队列比较，避免两个编辑器同时覆盖版本 0。
    if (!this.table.get(id)) {
      const initial = defaults.get(id);
      if (!initial) throw expertError('EXPERT_DELETED', '专家不存在，请刷新列表');
      if (!this.seeding) this.seeding = new Map();
      let seed = this.seeding.get(id);
      if (!seed) { seed = this.table.put(id, { ...initial, deleted: false }).finally(() => this.seeding.delete(id)); this.seeding.set(id, seed); }
      await seed;
    }
    await this.table.update(id, current => {
      signal?.throwIfAborted();
      if (current.revision !== expectedRevision) throw expertError('CONFLICT', '专家已被另一处修改，请保留当前表单并刷新后重试');
      if (current.deleted && !allowDeleted) throw expertError('EXPERT_DELETED', '专家已删除，请先恢复');
      return contract.stored.parse(transform(current));
    });
    return this.record(id).deleted ? undefined : { expert: this.get(id) };
  }
}
