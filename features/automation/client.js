import { createWorkspacePicker } from './workspace-picker.js';
import { automationContract } from './contract.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Glyph, ActionMenu, ConfirmDialog } = kit;
  const WorkspacePicker = createWorkspacePicker(React, ActionMenu);
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  return function AutomationView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, dirty, openAssistant } = useFeature(React, workbench, 'automation');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const cardsEnabled = workbench.internal.featureEnabled('cards');
    const [confirm, setConfirm] = useState(null);
    const [automations, setAutomations] = useState({ available: null, tasks: [], legacyTasks: [], issues: [] });
    const [taskDraft, setTaskDraft] = useState(null);
    const [taskDraftHidden, setTaskDraftHidden] = useState(false);
    const [taskRecovery, setTaskRecovery] = useState(null);
    const [taskHistory, setTaskHistory] = useState(null);
    const [selectedTask, setSelectedTask] = useState('');
    const workspaces = useSyncExternalStore(api.subscribeWorkspaces, api.workspaces, api.workspaces);
    const taskTiming = draft => {
      // HTML time 控件可能省略秒；只补齐原生输入格式，不在客户端计算触发时间。
      const time = /^\d{2}:\d{2}$/.test(draft.time) ? `${draft.time}:00` : draft.time;
      if (draft.rule === 'daily') return { daily: { time, time_zone: 'Asia/Shanghai' } };
      if (draft.rule === 'weekly') return { weekly: { time, time_zone: 'Asia/Shanghai', weekdays: draft.weekdays.split(',').map(value => Number(value.trim())) } };
      if (draft.rule === 'cron') return { cron: { expression: draft.expression, time_zone: 'Asia/Shanghai' } };
      return { [draft.rule]: draft.rule === 'at' ? draft.at.trim() : Number(draft.seconds) };
    };
    const beginTask = purpose => {
      if (taskDraft) { setTaskDraftHidden(false); return; }
      setTaskDraft({ purpose, title: purpose === 'knowledge' ? t('knowledgeTask') : purpose === 'news' ? t('newsDaily') : '', prompt: '', workspaceScope: { mode: 'all', excludedWorkspaceIds: [] }, rule: 'daily', time: '00:15:00', timeZone: 'Asia/Shanghai', weekdays: '1,2,3,4,5', seconds: '3600', at: '', expression: '0 8 * * *' });
      setTaskDraftHidden(false);
    };
    const editTask = task => run(async () => {
      const value = await api.automationRequest({ action: 'read', sessionId: task.sessionId, id: task.id }, operation.current?.controller.signal);
      if (!value.task || value.task.id !== task.id || value.legacy || value.purpose === 'news') throw new Error(t('taskReadback'));
      const record = value.task;
      return () => { setTaskDraft({ id: task.id, sessionId: task.sessionId, purpose: value.purpose, expected: record, expectedStatus: value.status, title: record.title || '', prompt: value.displayPrompt ?? record.prompt, workspaceScope: value.workspaceScope || { mode: 'all', excludedWorkspaceIds: [] }, rule: record.kind === 'every' ? 'every_seconds' : record.kind === 'after' ? 'at' : record.kind, time: record.time || '00:15:00', timeZone: record.timeZone || 'Asia/Shanghai', weekdays: (record.weekdays || [1, 2, 3, 4, 5]).join(','), seconds: String(record.everySeconds || 3600), at: record.scheduledAt || '', expression: record.expression || '', changeTime: false }); setTaskDraftHidden(false); };
    });
    const saveTask = resume => run(async () => {
      const signal = operation.current?.controller.signal;
      const draft = taskDraft;
      if (automations.available !== true) throw new Error(t('taskUnavailableShort'));
      let catalog;
      if (draft.id) {
        const update = { action: 'update', sessionId: draft.sessionId, id: draft.id, expected: draft.expected, expectedStatus: draft.expectedStatus, title: draft.title.trim(), workspaceScope: draft.workspaceScope, ...(draft.purpose === 'custom' ? { prompt: draft.prompt.trim() } : {}) };
        if (draft.changeTime) update.change = { kind: draft.rule === 'every_seconds' ? 'every' : draft.rule, ...taskTiming(draft) };
        const receipt = await api.automationRequest(update, signal);
        const current = await api.automationRequest({ action: 'read', sessionId: draft.sessionId, id: draft.id }, signal);
        // CAS 的完整原生记录来自 read，不从带 catalog 元数据的卡片拼装。
        if (!receipt.record || !current.task || current.status !== draft.expectedStatus || Object.keys(current.task).length !== Object.keys(receipt.record).length || Object.keys(receipt.record).some(key => JSON.stringify(current.task[key]) !== JSON.stringify(receipt.record[key]))) throw new Error(t('taskReadback'));
        catalog = await api.automationCatalog(signal);
      } else {
        const spec = { ...(draft.purpose === 'custom' ? { title: draft.title.trim(), prompt: draft.prompt.trim() } : {}), ...taskTiming(draft) };
        catalog = await api.createAutomation({ purpose: draft.purpose, spec, workspaceScope: draft.workspaceScope }, resume, signal);
      }
      return () => { setAutomations(catalog); setTaskDraft(null); setTaskRecovery(null); setConfirm(null); };
    }, 'taskSaved');
    const recoverTask = () => run(async () => {
      const recovered = await api.recoverAutomation(operation.current?.controller.signal);
      return () => { setAutomations(recovered.catalog); setTaskRecovery(recovered); if (recovered.recovered) { setTaskDraft(null); setConfirm(null); } };
    });
    const reloadTask = () => run(async () => {
      const value = await api.automationRequest({ action: 'read', sessionId: taskDraft.sessionId, id: taskDraft.id }, operation.current?.controller.signal);
      if (!value.task || value.task.id !== taskDraft.id) throw new Error(t('taskReadback'));
      return () => setTaskDraft(draft => ({ ...draft, expected: value.task, expectedStatus: value.status }));
    });
    const showTaskHistory = (task, before) => run(async () => {
      const value = await api.automationRequest({ action: 'history', sessionId: task.sessionId, id: task.id, limit: 20, ...(before ? { before } : {}) }, operation.current?.controller.signal);
      if (value.id !== task.id || !Array.isArray(value.records)) throw new Error(t('badReply'));
      return () => setTaskHistory({ task, ...value, records: before ? [...taskHistory.records, ...value.records] : value.records });
    });
    const toggleTask = task => run(async () => {
      const signal = operation.current?.controller.signal;
      const current = await api.automationRequest({ action: 'read', sessionId: task.sessionId, id: task.id }, signal);
      if (!current.task || current.legacy || !['active', 'paused'].includes(current.status) || current.status !== task.status) throw new Error(t('taskReadback'));
      // 状态与完整记录来自同一次权威读取，暂停/恢复不复用目录附加字段。
      const action = task.status === 'paused' ? 'resume' : 'pause';
      await api.automationRequest({ action, sessionId: task.sessionId, id: task.id, expected: current.task, expectedStatus: current.status }, signal);
      const catalog = await api.automationCatalog(signal);
      const saved = catalog.tasks.find(item => item.id === task.id && item.sessionId === task.sessionId);
      if (!saved || saved.status !== (action === 'pause' ? 'paused' : 'active')) throw new Error(t('taskReadback'));
      return () => setAutomations(catalog);
    }, 'taskToggled');
    const cancelTask = task => run(async () => {
      const signal = operation.current?.controller.signal;
      const receipt = await api.automationRequest({ action: 'delete', sessionId: task.sessionId, id: task.id }, signal);
      const current = await api.automationCatalog(signal);
      if (receipt.deleted !== true || [...current.tasks, ...current.legacyTasks].some(item => item.id === task.id && item.sessionId === task.sessionId)) throw new Error(t('taskReadback'));
      return () => { setAutomations(current); setConfirm(null); if (taskHistory?.task.id === task.id) setTaskHistory(null); };
    }, 'taskCancelled');
    const beijing = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : t('newsUnverified');
    const refreshTab = () => run(async () => { const value = await api.automationCatalog(operation.current?.controller.signal); return () => setAutomations(value); });
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) return false; setError(reason.message || t('requestFailed')); return true; } });

    let body;
      const pending = api.pendingAutomation();
      const locked = Boolean(api.automationCacheIssue());
      const knowledgeTasks = automations.tasks.filter(task => task.purpose === 'knowledge');
      const allTasks = [...automations.tasks, ...automations.legacyTasks.map(task => ({ ...task, legacy: true }))];
      const taskKey = task => `${task.sessionId}:${task.id}`;
      const selected = allTasks.find(task => taskKey(task) === selectedTask) || allTasks[0];
      const taskStatus = task => (task.purpose === 'news' && !cardsEnabled ? '所属功能已关闭 · ' : '') + t(task.status === 'active' ? 'taskActive' : task.status === 'paused' ? 'taskPaused' : 'taskInactive');
      const taskActions = task => h(ActionMenu, { label: t('taskActions'), iconOnly: true },
        !task.legacy && automations.controls !== false && ['active', 'paused'].includes(task.status) && button(task.status === 'paused' ? 'taskResume' : 'taskPause', () => toggleTask(task), Boolean(taskDraft)),
        !task.legacy && task.purpose !== 'news' && ['active', 'paused'].includes(task.status) && button('editTask', () => editTask(task), Boolean(taskDraft)),
        button('openTaskSession', () => run(async () => api.openAutomation(task.sessionId))),
        button('taskHistory', () => showTaskHistory(task)),
        button('cancelPlan', () => { setSelectedTask(taskKey(task)); setConfirm({ kind: 'automation', task }); }, Boolean(taskDraft)));
      const patchTask = (key, value, timing = false) => setTaskDraft(draft => ({ ...draft, [key]: value, ...(timing ? { changeTime: true, timeZone: 'Asia/Shanghai' } : {}) }));
      // 新版调度内建于宿主；刷新是共同恢复入口，插件页只用于旧版。
      body = h('section', { className: 'yj-schedules' },
        automations.available === false && h('div', { className: 'yj-schedule-off', role: 'status' }, h('div', null, h('strong', null, t('taskUnavailableShort')), help('scheduleUnavailable')), row(button('retry', refreshTab, false, { className: 'yj-primary' }), button('legacyScheduleSettings', () => run(async () => api.openPlugins())))),
        api.automationCacheIssue() && h('p', { className: 'yj-notice yj-error', role: 'alert' }, api.automationCacheIssue()),
        automations.issues.length > 0 && h('details', { className: 'yj-notice' }, h('summary', null, t('newsDiagnostics')), ...automations.issues.map((issue, i) => h('p', { key: i, className: 'yj-error' }, issue.message))),
        h('div', { className: 'yj-task-split' },
          h('aside', { className: 'yj-task-list', 'aria-label': t('schedule') },
            row(h('h2', null, t('schedule')), button('newTask', () => beginTask('custom'), locked || Boolean(pending) || Boolean(taskDraft))),
            taskDraft && taskDraftHidden && button('taskDraftResume', () => setTaskDraftHidden(false)),

            !knowledgeTasks.length && h('article', { className: 'yj-task-template' }, h('h3', null, t('knowledgeTask')), h('small', null, t('taskDisabled')), button('enableTask', () => beginTask('knowledge'), locked || Boolean(pending) || automations.legacyTasks.length > 0 || Boolean(taskDraft))),
            ...allTasks.map(task => h('article', { key: taskKey(task), className: `yj-task-row${selected && taskKey(task) === taskKey(selected) ? ' yj-selected' : ''}` },
              h('button', { type: 'button', className: 'yj-task-select', 'aria-pressed': selected && taskKey(task) === taskKey(selected), onClick: () => { setSelectedTask(taskKey(task)); setTaskHistory(null); } },
                h('span', null, task.title || t(task.legacy ? 'taskLegacy' : 'schedule')), h('small', null, taskStatus(task), ' · ', task.status === 'active' ? beijing(task.scheduledAt) : t('rule_' + (task.kind === 'every' ? 'every_seconds' : task.kind === 'after' ? 'at' : task.kind)))), taskActions(task)))),
          h('div', { className: 'yj-task-main' },
            pending && h('section', { className: 'yj-notice', role: 'status' }, h('h3', null, t('taskPending')), help('taskPendingHelp'),
              row(button('taskRecover', recoverTask), button('openTaskSession', () => run(async () => api.openAutomation(pending.sessionId)))),
              taskRecovery?.pending?.sessionId === pending.sessionId && h(React.Fragment, null, help('taskPendingMissing'), !taskDraft && button('taskDraftResume', () => beginTask(pending.purpose), locked))),
        taskDraft && !taskDraftHidden && h('section', { className: 'yj-task-editor', 'aria-label': t(taskDraft.id ? 'editTask' : 'newTask') },
          h('h2', null, t(taskDraft.id ? 'editTask' : taskDraft.purpose === 'knowledge' ? 'knowledgeTask' : 'newTask')),
          taskDraft.purpose === 'knowledge' && help('taskScopeHelp'), help('taskModelHelp'),
          field('taskTitle', taskDraft.title, value => patchTask('title', value), { disabled: busy || taskDraft.purpose === 'knowledge' && !taskDraft.id }),
          taskDraft.purpose === 'custom' && h('label', { className: 'yj-field' }, t('taskPrompt'), h('textarea', { value: taskDraft.prompt, disabled: busy, onChange: event => patchTask('prompt', event.target.value) })),
          h(WorkspacePicker, { items: workspaces.items || [], scope: taskDraft.workspaceScope, disabled: busy, t, onChange: value => patchTask('workspaceScope', value) }),
          help(taskDraft.purpose === 'knowledge' ? 'workspaceScopeHelp' : 'customWorkspaceHelp'),
          taskDraft.purpose !== 'news' && h('label', { className: 'yj-field' }, t('taskRule'), h('select', { value: taskDraft.rule, disabled: busy, onChange: event => patchTask('rule', event.target.value, true) },
            ...['after_seconds', 'at', 'every_seconds', 'daily', 'weekly', 'cron'].filter(rule => !taskDraft.id || rule !== 'after_seconds').map(rule => h('option', { key: rule, value: rule }, t('rule_' + rule))))),
          ['after_seconds', 'every_seconds'].includes(taskDraft.rule) && field('taskSeconds', taskDraft.seconds, value => patchTask('seconds', value, true), { type: 'number' }),
          taskDraft.rule === 'at' && field('taskAt', taskDraft.at, value => patchTask('at', value, true)),
          taskDraft.purpose !== 'news' && ['daily', 'weekly'].includes(taskDraft.rule) && h('div', { className: 'yj-task-time' }, field('time', taskDraft.time, value => patchTask('time', value, true), { type: 'time', step: '60' }), h('span', { className: 'yj-muted' }, taskDraft.timeZone === 'Asia/Shanghai' ? t('beijingTime') : t('legacyTimeZone', { zone: taskDraft.timeZone })), taskDraft.timeZone !== 'Asia/Shanghai' && button('convertBeijingTime', () => patchTask('timeZone', 'Asia/Shanghai', true))),
          taskDraft.rule === 'weekly' && field('taskWeekdays', taskDraft.weekdays, value => patchTask('weekdays', value, true)),
          taskDraft.rule === 'cron' && h('div', { className: 'yj-task-time' }, field('taskExpression', taskDraft.expression, value => patchTask('expression', value, true)), h('span', { className: 'yj-muted' }, taskDraft.timeZone === 'Asia/Shanghai' ? t('beijingTime') : t('legacyTimeZone', { zone: taskDraft.timeZone })), taskDraft.timeZone !== 'Asia/Shanghai' && button('convertBeijingTime', () => patchTask('timeZone', 'Asia/Shanghai', true))),
          row(button(taskDraft.id ? 'saveTask' : pending ? 'taskContinue' : 'submitTask', () => saveTask(Boolean(pending)), !taskDraft.title.trim() || taskDraft.purpose === 'custom' && !taskDraft.prompt.trim() || Boolean(pending) && taskRecovery?.pending?.sessionId !== pending.sessionId),
            taskDraft.id && button('taskReload', reloadTask), button('taskDraftClose', () => setTaskDraftHidden(true)), button('taskDiscard', () => setConfirm({ kind: 'taskDraft' }))),
          confirm?.kind === 'taskDraft' && h(ConfirmDialog, { title: t('taskDiscard'), message: t('taskDiscardConfirm'), confirmLabel: t('taskDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setTaskDraft(null); setConfirm(null); notify(t('draftDiscarded')); } })),
            (!taskDraft || taskDraftHidden) && (selected ? h('section', { className: 'yj-task-detail' },
              h('div', { className: 'yj-team-heading' }, h('div', null, h('h2', null, selected.title || t('schedule')), h('p', { className: 'yj-muted' }, [taskStatus(selected), selected.timeZone && selected.timeZone !== 'Asia/Shanghai' && selected.timeZone].filter(Boolean).join(' · '))), button('openTaskSession', () => run(async () => api.openAutomation(selected.sessionId)))),
              selected.status === 'active' && h('p', { className: 'yj-muted' }, t('taskTime'), ' · ', beijing(selected.scheduledAt)),
              selected.purpose !== 'news' && h('p', { className: 'yj-task-prompt' }, selected.displayPrompt ?? selected.prompt),
              selected.purpose === 'news' && cardsEnabled && button('news', () => { return workbench.openTab('cards'); }),
              selected.legacy && help('taskLegacyHelp'),
              h('details', null, h('summary', null, t('taskDetails')), help('scheduleHelp'), help('taskModelHelp'), help('taskStatusHelp')))
              : h('div', { className: 'yj-task-empty' }, h(Glyph, { name: 'spark', size: 28 }), h('h2', null, t('taskSelect')))),
            confirm?.kind === 'automation' && h(ConfirmDialog, { title: t('cancelPlan'), message: t('cancelPlanHelp'), confirmLabel: t('cancelPlan'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => cancelTask(confirm.task) }),
            taskHistory && h('section', { className: 'yj-section', 'aria-label': t('taskHistory') }, h('h2', null, taskHistory.task.title || t('taskHistory')), help('historyHelp'),
              taskHistory.records.length ? taskHistory.records.map((record, i) => h('details', { key: record.messageId || i }, h('summary', null, record.deliveredAt || t('historyDetails')), h('p', null, record.prompt), h('small', null, record.messageId))) : help('noHistory'),
              (taskHistory.earlierRecordsUnavailable || taskHistory.earlierRecordsPruned) && help('historyEarlier'),
              row(taskHistory.nextBefore && button('historyMore', () => showTaskHistory(taskHistory.task, taskHistory.nextBefore)), button('closePanel', () => setTaskHistory(null)))))));


    return active ? body : null;
  };
}

export const name = 'whalewing-automation';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'automation', createView, { contract: automationContract, namespace: 'whalewingAutomation', entries: scope => scope.inject(['uiScheduleNavigation'], child => child.effect(() => child.uiScheduleNavigation.hide())) }); }
