import { mountFeatures } from './feature-fixture.mjs';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm';
import SessionStore from '@deepseek-ai/dsh-session';
import SessionProjections from '@deepseek-ai/dsh-session-projection';
import CommandRuntime from '@deepseek-ai/dsh-commands';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import * as JsonlModule from '@deepseek-ai/dsh-session-persistence-jsonl';
import SessionQuery from '@deepseek-ai/dsh-session-query';
import Controller from '@deepseek-ai/dsh-api-session-controller';
import Workspace from '@deepseek-ai/dsh-workspace';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Presets from '@deepseek-ai/dsh-agent-preset-registry';
import DefaultModel from '@deepseek-ai/dsh-agent-default-model';
import Storage from '@deepseek-ai/dsh-storage';
import * as StorageJson from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SessionPersistenceJsonl = JsonlModule.default ?? JsonlModule;

// 模型输出与外围技能内容为内存载体；Controller、命令、日志、投影及loop使用当前真实包。
class Adapter extends LlmAdapter {
  requests = [];
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async *stream(options) {
    this.requests.push(options);
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: 'done' };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

export async function managementHarness(t) {
  const ctx = new Context();
  const directory = await mkdtemp(path.join(os.tmpdir(), 'whalewing-management-'));
  t.after(async () => {
    await ctx.fiber.dispose();
    // 只回收本测试在系统临时目录创建的资源，不穿越外部联接。
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('whalewing-management-'));
    await rm(directory, { recursive: true, force: true });
  });
  new TypertRegistry(ctx);
  await ctx.plugin(Storage);
  await ctx.plugin(StorageJson, { root: directory });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  ctx.provide('skills', { async list() { return []; }, async get(name) { return { name, description: '测试基础技能', content: '测试正文' }; } });
  await ctx.plugin(DefaultModel, { provider: 'fixture', model: 'fixture' });
  ctx.agentDefaultModel.saveSelection = () => { throw new Error('禁止写全局默认'); };
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, CommandRuntime]) await ctx.plugin(plugin);
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  for (const plugin of [ToolRuntime, AgentRegistry]) await ctx.plugin(plugin);
  await ctx.plugin(AgentLoop, { agents: [] });
  await ctx.plugin(SessionPersistenceJsonl, { root: path.join(directory, 'sessions'), compression: 'none' });
  await ctx.plugin(SessionQuery);
  await ctx.plugin(Workspace);
  ctx.provide('attachments', { imageLimits: { maxImageBytes: 1024, maxImagesPerMessage: 1, maxMessageImageBytes: 1024, maxImagePixels: 1024, maxImageDimension: 1024, mediaTypes: ['image/png'] } });
  ctx.provide('fileUploads', { registerAgentResolver() { return () => {}; } });
  ctx.provide('fs', {}); ctx.provide('remoteAccess', { allows: () => true });
  await ctx.plugin(Loader, { baseUrl: import.meta.url });
  await ctx.plugin(Presets, { default: 'standard' });
  // 这是无模式工具的局部装配夹具；不冒充官方 standard 预设的端到端验收。
  await ctx.agentPresets.register({ id: 'standard', plugins: [] });
  await ctx.plugin(Controller, { nativeOpen: false });
  const adapter = new Adapter();
  ctx.llm.registerAdapter(['fixture'], adapter);
  const mounted = await mountFeatures(ctx, directory, {}, false);
  const expertPlugin = mounted.service.registry.bases.get('experts').fiber;
  await expertPlugin.await();
  // 普通身份由真实Controller安装模型投影与选择器；子任务和种子使用原生Agent入口。
  const create = async (id, extra = {}) => {
    if (extra.parentAgent || extra.seed) return (await ctx.agents.create({ sessionId: id, meta: { agentPreset: 'standard' }, agentOptions: { provider: 'fixture', model: 'fixture' }, ...extra })).agent;
    const receipt = await ctx.sessionController.create({ sessionId: id, cwd: directory, agentPreset: 'standard' });
    assert.equal(receipt.sessionId, id);
    return (await ctx.sessionController.resolveAgent(id)).agent;
  };
  const agent = await create('parent');
  const run = (input, subject = agent) => ctx.commands.execute(subject, `/whalewing-expert ${typeof input === 'string' ? input : JSON.stringify(input)}`, [], new AbortController().signal);
  const state = (subject = agent) => ctx.sessionProjections.stateOf(subject.session, 'whalewingExpert');
  return { mounted, ctx, agent, create, run, state, expertPlugin, directory };
}
