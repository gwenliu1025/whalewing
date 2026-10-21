import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as NativeManagerTools from '@deepseek-ai/dsh-plugin-manager/tools';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

const toolName = 'plugin_manager';
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 只装配原生能力；包管理操作、审批与结果解释仍由 DSH 持有。 */
export function applyManagement(ctx) {
  ctx.inject(['whalewingExperts', 'agents'], scope => {
    const lastTurn = new WeakMap();
    const selected = agent => scope.whalewingExperts.selectedFor(agent) === 'manager';
    scope.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
      const decision = await next();
      if (decision.kind === 'reject' || signal.aborted || !decision.messages.length || !selected(agent) || lastTurn.get(agent) === turn) return decision;
      lastTurn.set(agent, turn);
      const ready = Boolean(scope.get('tools')?.get(toolName, agent));
      const text = [
        '【鲸翼插件管理上下文 · 非用户原话】',
        `当前安装包目录：${packageRoot}`,
        ...['README.md', 'EXTENDING.md', 'MAINTAINING.md', 'examples/feature-starter', 'examples/stateful-feature'].map(name => `${name}：${path.join(packageRoot, name)}`),
        `原生 plugin_manager：${ready ? '当前会话可见，执行仍经原生批准' : '当前会话尚不可用；保留其它能力，检查原生依赖与模式限制' }。`,
        '管理任务按 whalewing-plugin-management 技能加载上述文档；安装目录不等于可写开发仓库。此上下文仅适用于本轮小鲸身份。',
      ].join('\n');
      return { ...decision, messages: [...decision.messages, createUserMessage({ source: { kind: 'whalewing-plugin-management' }, content: [{ type: 'text', text }] })] };
    }, { prepend: true });
    scope.on('session/event', (session, event) => {
      if (event.type === 'command/done') {
        const agent = scope.agents.get(session.id);
        if (agent && !selected(agent)) lastTurn.delete(agent);
      }
    });
    scope.inject(['tools', 'pluginManager', 'sandboxPolicy'], ready => {
      const records = new Map();
      const ended = new WeakSet();
      let closing = false;
      function stop(agent) {
        const record = records.get(agent);
        if (!record) return;
        records.delete(agent);
        record.controller.abort(new Error('小鲸管理范围已退出；已接收的操作仍需核对原生结果'));
        record.guard(); record.around(); record.agentCleanup?.();
        // 撤注册不等待进行中的工具调用，避免自卸载形成自等。
        void record.fork?.dispose();
      }
      function sync(agent) {
        if (closing) return;
        const record = records.get(agent);
        if (ended.has(agent) || !selected(agent)) { stop(agent); return; }
        const view = ready.tools.view(agent);
        if (record?.installing) {
          // 注册会同步发布 tools/change，先识别自有定义，覆盖插件就绪前的实际调用。
          if (!view.restrictableNames.has(toolName)) record.definition ??= view.visible.get(toolName);
          return;
        }
        if (record) {
          // 原生祖先层后来提供同名能力时撤回自己的覆盖，包括被限制隐藏的能力。
          if (view.restrictableNames.has(toolName)) stop(agent);
          return;
        }
        if (view.knownNames.has(toolName)) return;
        const own = { controller: new AbortController(), installing: true };
        records.set(agent, own);
        const isOwn = exec => exec.name === toolName && ready.tools.get(toolName, exec.agent) === own.definition;
        own.guard = agent.ctx.tools.guard(exec => {
          if (isOwn(exec) && (own.controller.signal.aborted || exec.agent !== agent || !selected(exec.agent))) return '小鲸管理身份已变化，请从当前主会话重新核对';
        });
        own.around = agent.ctx.on('tools/execute', async (exec, next) => {
          if (!isOwn(exec)) return next();
          const original = exec.signal;
          exec.signal = AbortSignal.any([original, own.controller.signal]);
          try { return await next(); }
          finally { exec.signal = original; }
        });
        own.agentCleanup = agent.ctx.effect(() => () => {
          if (records.get(agent) === own) { ended.add(agent); stop(agent); }
        }, 'whalewing assistant management lifetime');
        own.fork = agent.ctx.plugin(NativeManagerTools);
        own.definition = ready.tools.get(toolName, agent);
        Promise.resolve(own.fork).then(() => {
          if (records.get(agent) !== own) return;
          own.definition = ready.tools.get(toolName, agent);
          own.installing = false;
          sync(agent);
        }, () => { if (records.get(agent) === own) stop(agent); });
      }
      ready.on('agent/created', ({ agent }) => sync(agent));
      ready.on('session/event', (session, event) => {
        if (event.type === 'command/done') {
          const agent = ready.agents.get(session.id);
          if (agent) sync(agent);
        }
      });
      ready.on('tools/change', () => { for (const agent of ready.agents.list()) sync(agent); });
      ready.effect(() => () => {
        closing = true;
        for (const agent of [...records.keys()]) stop(agent);
      }, 'whalewing assistant management scope');
      for (const agent of ready.agents.list()) sync(agent);
    });
  });
}
