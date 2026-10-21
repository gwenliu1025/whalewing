import { skillLibraryContract } from './contract.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, ConfirmDialog } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  function SkillEditor({ api, entry, t, onClose, onSaved, notify }) {
    const [name, setName] = useState('');
    const [content, setContent] = useState(entry?.content ?? '---\nname: my-skill\ndescription: 描述适用场景与完成目标\n---\n\n# 操作步骤\n\n');
    const [busy, setBusy] = useState(false);
    const setError = message => { if (message) notify(message, { kind: 'error' }); };
    const [unverified, setUnverified] = useState(false);
    const current = useRef(entry);
    const createdId = useRef(null);
    const saving = useRef(false);
    const modal = useRef(null);
    const lifetime = useRef(null);
    useEffect(() => {
      lifetime.current = new AbortController();
      const previous = typeof document === 'undefined' ? null : document.activeElement;
      modal.current?.showModal();
      return () => { lifetime.current.abort(); modal.current?.close(); previous?.focus(); };
    }, []);
    const readSaved = async () => {
      const signal = lifetime.current?.signal;
      const value = await api.skillRequest({ action: 'read', id: current.current?.id || createdId.current }, signal);
      // 原件编辑首次落为覆盖，未知回执只能消费 owner 返回的覆盖身份，不能拼目录。
      return api.resolveSkillEdit(value.entry, signal);
    };
    const load = async () => {
      setBusy(true); setError('');
      try { const actual = await readSaved(); lifetime.current?.signal.throwIfAborted(); if (actual) { current.current = actual; setContent(actual.content); } setUnverified(false); }
      catch (reason) { setError(reason.message); }
      finally { setBusy(false); }
    };
    const save = async () => {
      if (saving.current || unverified) return;
      if (!current.current && !createdId.current && !name.trim()) { setError(t('skillIdentifierHelp')); return; }
      createdId.current ||= current.current ? null : `${name.trim()}/SKILL.md`;
      const before = current.current;
      let accepted;
      saving.current = true; setBusy(true); setError('');
      try {
        const input = before ? { action: 'update', id: before.id, content, expectedHash: before.hash, ...(before.baseHash === undefined ? {} : { expectedBaseHash: before.baseHash }) } : { action: 'create', id: createdId.current, content, expectedHash: '' };
        const saved = await api.skillRequest(input, lifetime.current?.signal);
        if (!saved.entry) throw new Error(t('skillReadback'));
        accepted = saved.entry;
        current.current = saved.entry;
        const actual = await readSaved();
        if (!actual || actual.hash !== saved.entry.hash || actual.content !== saved.entry.content) throw new Error(t('skillReadback'));
        lifetime.current?.signal.throwIfAborted();
        await onSaved(actual);
      } catch (reason) {
        if (lifetime.current?.signal.aborted) return;
        try {
          const actual = await readSaved();
          if (accepted && actual?.hash === accepted.hash && actual.content === accepted.content) { current.current = actual; await onSaved(actual); return; }
          // 已有不同版本保留草稿，只有员工明确载入后才采用新的写前哈希。
          setUnverified(Boolean(actual && (actual.id !== before?.id || actual.hash !== before?.hash)));
        } catch { setUnverified(true); }
        setError(reason.message);
      } finally { saving.current = false; if (!lifetime.current?.signal.aborted) setBusy(false); }
    };
    return h('dialog', { ref: modal, className: 'yj-editor yj-page', 'aria-label': t(entry ? 'editSkill' : 'newSkill'), onCancel: event => { event.preventDefault(); if (!busy) onClose(); } },
      h('header', { className: 'yj-header' }, h('h2', null, t(entry ? 'editSkill' : 'newSkill')), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': t('close') }, '×')),
      h('div', { className: 'yj-editor-body' }, !entry && h('label', null, t('skillIdentifier'), h('input', { value: name, disabled: busy || Boolean(createdId.current), onChange: event => setName(event.target.value), placeholder: 'my-skill' }), h('small', null, t('skillIdentifierHelp'))), entry?.origin === 'builtin' && h('p', { className: 'yj-notice' }, t('skillBuiltinHelp')), h('label', null, t('skillContent'), h('textarea', { value: content, disabled: busy, onChange: event => setContent(event.target.value), spellCheck: false })), unverified && h('p', { className: 'yj-notice' }, t('skillReadback'), h('button', { type: 'button', onClick: load, disabled: busy }, t('skillLoadSaved')))),
      h('footer', { className: 'yj-row' }, h('button', { type: 'button', disabled: busy, onClick: onClose }, t('cancelEdit')), h('button', { type: 'button', className: 'yj-primary', disabled: busy || unverified, onClick: save }, t('saveSkill'))));
  }

  return function SkillsView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, dirty, openAssistant } = useFeature(React, workbench, 'skills');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const [skills, setSkills] = useState([]);
    const [skillPage, setSkillPage] = useState({ offset: 0, total: 0, truncated: false });
    const skillPages = useRef([]);
    const [skillEditor, setSkillEditor] = useState(undefined);
    const [skill, setSkill] = useState(null);
    const skillCommand = (action, extra = {}) => api.skillRequest({ action, ...extra }, operation.current?.controller.signal);
    const adoptSkills = value => { setSkills(value.entries); setSkillPage({ offset: value.offset, total: value.total, truncated: value.truncated }); };
    const pageSkills = (offset, direction) => run(async () => { const value = await skillCommand('list', { offset }); return () => { if (direction === 'next') skillPages.current.push(skillPage.offset); if (direction === 'previous') skillPages.current.pop(); adoptSkills(value); }; });
    const readEvolution = async (name, state) => {
      let offset = 0;
      do {
        const page = await skillCommand('list', { offset });
        const entry = page.entries.find(item => item.origin === 'evolution' && item.name === name && item.state === state);
        if (entry) return (await skillCommand('read', { id: entry.id })).entry;
        if (!page.truncated || !page.entries.length) break;
        const next = page.offset + page.entries.length;
        if (next <= offset) throw new Error(t('badReply'));
        offset = next;
      } while (true);
      throw new Error(t('skillMissing'));
    };
    const refreshTab = () => run(async () => { const value = await skillCommand('list'); return () => { adoptSkills(value); skillPages.current = []; }; });
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) return false; setError(reason.message || t('requestFailed')); return true; } });

    let body;
    body = h('section', { className: 'yj-skill-library' }, row(h('h2', null, t('skillLibrary')), button('newSkill', () => setSkillEditor(null)), button('refine', () => openAssistant(t('refinePrompt')), dirty)),
      h('div', { className: 'yj-split' }, h('div', { className: 'yj-list' }, skills.length ? skills.map((item) => h('button', { type: 'button', className: 'yj-note', key: item.id, disabled: busy || !item.actions.includes('read'), onClick: () => run(async () => { const value = await skillCommand('read', { id: item.id }); if (!value.entry) throw new Error(t('skillMissing')); return () => { setSkill(value.entry); setConfirm(null); }; }) }, item.name, h('small', { title: item.discovery === 'catalogued' ? t('skillHelp') : undefined }, t(item.origin), item.state && ` · ${t(item.state)}`, ` · ${t(item.discovery)}`), h('small', { className: 'yj-clamp', title: item.description }, item.description), item.issue && h('span', { className: 'yj-error' }, `${t('skillIssue')}: ${item.issue}`))) : help('emptySkills'), row(button('previous', () => pageSkills(skillPages.current.at(-1), 'previous'), !skillPages.current.length), button('next', () => pageSkills(skillPage.offset + skills.length, 'next'), !skillPage.truncated || !skills.length))),
        skill ? h('div', null, h('h3', null, skill.name), row(skill.actions.includes('update') && button('editSkill', () => run(async () => { const current = await api.resolveSkillEdit(skill, operation.current.controller.signal); if (!current) throw new Error(t('skillMissing')); return () => setSkillEditor(current); })), ...['remove', 'reset'].filter(action => skill.actions.includes(action)).map(action => button(action === 'remove' ? 'removeSkill' : 'resetSkill', () => setConfirm({ kind: `skill-${action}`, id: skill.id })))),
          skill.origin === 'evolution' && button('skillEdit', () => openAssistant(t('skillEditPrompt', { reference: JSON.stringify({ name: skill.name, state: skill.state, hash: skill.hash }) }))), skill.issue && h('div', { className: 'yj-notice yj-error', role: 'status' }, `${t('skillIssue')}: ${skill.issue}`), h('pre', null, skill.content), skill.sourcePaths && h('h3', null, t('sourcePaths')), h('ul', null, ...(skill.sourcePaths || []).map((source) => h('li', { key: source }, source))),
          ['remove', 'reset'].map(action => confirm?.kind === `skill-${action}` && confirm.id === skill.id && h(ConfirmDialog, { key: action, title: t(action === 'remove' ? 'skillRemoveTitle' : 'skillResetTitle'), message: t(action === 'remove' ? 'skillConfirmRemove' : 'skillConfirmReset'), confirmLabel: t(action === 'remove' ? 'removeSkill' : 'resetSkill'), cancelLabel: t('cancel'), danger: action === 'remove', busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => { const result = await skillCommand(action, { id: skill.id, expectedHash: skill.hash, ...(skill.baseHash === undefined ? {} : { expectedBaseHash: skill.baseHash }) }); if ((await skillCommand('read', { id: skill.id })).entry !== null) throw new Error(t('skillReadback')); const base = action === 'reset' ? (await skillCommand('read', { id: result.baseId })).entry : null; const value = await skillCommand('list'); return () => { adoptSkills(value); setSkill(base); setConfirm(null); }; }, action === 'remove' ? 'skillRemoved' : 'skillResetDone') })),
          skill.origin === 'evolution' && skill.state !== 'candidate' && row(
          button(skill.state === 'active' ? 'disable' : 'restoreSkill', () => run(async () => { await skillCommand(skill.state === 'active' ? 'disable' : 'restore', { name: skill.name, expectedHash: skill.hash }); const value = await skillCommand('list'); return () => { adoptSkills(value); setSkill(null); setConfirm(null); }; }, 'skillToggled')),
          button('rollbackSkill', () => setConfirm({ kind: 'skill-rollback', name: skill.name, expectedHash: skill.state === 'active' ? skill.hash : skills.find((item) => item.name === skill.name && item.state === 'active')?.hash || '' }))),
          confirm?.kind === 'skill-rollback' && confirm.name === skill.name && h(ConfirmDialog, { title: t('skillRollbackTitle'), message: t('confirmRollback'), confirmLabel: t('confirmRollbackAction'), cancelLabel: t('cancel'), busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => {
            // 回退以当前 active 的版本为前提，停用文件不是发布前备份。
            const saved = await skillCommand('rollback', { name: skill.name, expectedHash: confirm.expectedHash });
            const restored = await readEvolution(skill.name, 'active');
            if (saved.hash !== restored.hash) throw Object.assign(new Error(t('conflict')), { code: 'conflict' });
            const value = await skillCommand('list');
            return () => { adoptSkills(value); setSkill(restored); setConfirm(null); };
          }, 'skillRolledBack') })) : help('selectSkill')));

    body = h(React.Fragment, null, body, skillEditor !== undefined && h(SkillEditor, { key: skillEditor?.id || 'new-skill', api, entry: skillEditor, t, notify, onClose: () => setSkillEditor(undefined), onSaved: async entry => { const value = await api.skillRequest({ action: 'list' }); adoptSkills(value); setSkill(entry); setSkillEditor(undefined); notify(t('skillSaved')); } }));
    return active ? body : null;
  };
}

export const name = 'whalewing-skills';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'skills', createView, { contract: skillLibraryContract, namespace: 'whalewingSkills' }); }
