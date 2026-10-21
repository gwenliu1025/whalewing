import { readAvatarFile } from '../../src/avatar-image.js';
import { registerEntries } from './entries.js';
import { expertContract } from './contract.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Avatar, ActionMenu, ConfirmDialog, z, avatarArt, presetAvatars } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  function ExpertEditor({ api, expert, onClose, t, notify }) {
    const avatarRead = useRef(null);
    const [avatarReading, setAvatarReading] = useState(false);
    useEffect(() => () => avatarRead.current?.abort(), []);
    const [draft, setDraft] = useState(() => expert ? { ...expert, skills: [...expert.skills], mcpServers: [...expert.mcpServers] } : { name: '', description: '', avatar: null, prompt: '', model: null, skills: [], mcpServers: [] });
    const [catalog, setCatalog] = useState(null);
    const [busy, setBusy] = useState(false);
    // 报错走右上角提示，不在表单底部插入一行把按钮往下挤。
    const setError = message => { if (message) notify(message, { kind: 'error' }); };
    const [recovery, setRecovery] = useState(null);
    const modal = useRef(null);
    const saving = useRef(false);
    const [initialIdentity] = useState(() => expert || { id: `custom-${globalThis.crypto.randomUUID()}`, revision: 0 });
    const committed = useRef(initialIdentity);
    const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
    useEffect(() => {
      const previous = typeof document === 'undefined' ? null : document.activeElement;
      modal.current?.showModal();
      let live = true;
      api.expertRequest({ action: 'catalog' }).then(value => { if (live) setCatalog(value); }, reason => { if (live) setError(reason.message); });
      return () => { live = false; modal.current?.close(); previous?.focus(); };
    }, []);
    const savedText = value => t(expert ? 'expertSavedNamed' : 'expertCreated', { name: value.name });
    const save = async () => {
      if (saving.current || avatarReading) return;
      if (![draft.name, draft.description, draft.prompt].every(value => value.trim())) { setError(t('requiredExpert')); return; }
      saving.current = true; setBusy(true); setError('');
      const identity = committed.current;
      const { name, description, avatar, prompt, model, skills, mcpServers } = draft;
      const fields = { name, description, avatar, prompt, model, skills, mcpServers };
      try {
        const saved = await api.expertRequest({ action: 'save', id: identity.id, expectedRevision: identity.revision, expert: fields });
        // 成功回执已经确定身份；列表失败后重试仍更新同一专家，不再创建第二位。
        committed.current = saved.expert;
        const readback = await api.loadExperts();
        if (!readback.experts.some(item => item.id === saved.expert.id && item.revision === saved.expert.revision)) throw new Error(t('badReply'));
        notify(savedText(saved.expert)); onClose();
      } catch (reason) {
        // 未知接受只按表单的固定身份读回核对；头像规范化后不一致时仍保留表单，不猜测成功。
        try {
          const actual = (await api.loadExperts()).experts.find(item => item.id === identity.id);
          const expected = expertContract(z).fields.parse(fields);
          if (actual && actual.revision > identity.revision && Object.keys(expected).every(key => JSON.stringify(actual[key]) === JSON.stringify(expected[key]))) {
            committed.current = actual; notify(savedText(actual)); onClose(); return;
          }
          if (actual && actual.revision > identity.revision) setRecovery(actual);
        } catch { /* 读回失败不触发新身份或自动重试写入。 */ }
        setError(reason.message);
      }
      finally { saving.current = false; setBusy(false); }
    };
    const upload = async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      avatarRead.current?.abort();
      const controller = new AbortController(); avatarRead.current = controller;
      setAvatarReading(true); setError('');
      try {
        const value = await readAvatarFile(file, { signal: controller.signal });
        if (!controller.signal.aborted) update('avatar', value);
      } catch (reason) { if (!controller.signal.aborted) setError(reason.message); }
      finally { if (!controller.signal.aborted) setAvatarReading(false); }
    };
    const modelOptions = (catalog?.models || []).flatMap(group => (group.models || []).map(model => ({ ...model, provider: group.id, value: JSON.stringify({ provider: group.id, model: model.id }) })));
    const selectedModel = modelOptions.find(item => item.provider === draft.model?.provider && item.id === draft.model?.model);
    const modelValue = draft.model ? JSON.stringify({ provider: draft.model.provider, model: draft.model.model }) : '';
    const choices = (kind, title) => {
      const available = catalog?.[kind] || [];
      return h('details', { className: 'yj-section' }, h('summary', null, t(title), ` (${draft[kind].length})`), h('p', { className: 'yj-muted' }, t('catalogHelp')),
        ...[...available, ...draft[kind].filter(name => !available.some(item => item.name === name)).map(name => ({ name, missing: true }))].map(item => h('label', { className: 'yj-check yj-choice', key: item.name },
          h('input', { type: 'checkbox', checked: draft[kind].includes(item.name), disabled: busy, onChange: event => update(kind, event.target.checked ? [...draft[kind], item.name] : draft[kind].filter(name => name !== item.name)) }),
          h('span', null, item.name, h('small', null, item.missing ? t('missingBinding') : item.description || item.tools?.join(' · '))))), !available.length && h('p', { className: 'yj-muted' }, t('emptyCatalog')));
    };
    return h('dialog', { ref: modal, className: 'yj-editor yj-page', 'aria-label': t(expert ? 'editExpert' : 'addExpert'), onCancel: event => { event.preventDefault(); if (!busy) onClose(); }, onClick: event => { if (event.target === event.currentTarget && !busy) onClose(); } },
      h('header', { className: 'yj-header' }, h('h2', null, t(expert ? 'editExpert' : 'addExpert')), h('button', { type: 'button', disabled: busy, onClick: onClose, 'aria-label': t('editorClose') }, '×')),
      h('div', { className: 'yj-editor-body' }, h('div', { className: 'yj-avatar-picker' }, h(Avatar, { expert: draft, size: 64 }),
        h('div', { className: 'yj-avatar-side' },
          h('div', { className: 'yj-avatar-actions' }, h('label', { className: 'yj-avatar-upload' }, t('avatar'), h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', disabled: busy, onChange: upload })), h('button', { type: 'button', disabled: busy, onClick: () => update('avatar', null) }, t('clearAvatar'))),
          presetAvatars.length > 0 && h('div', { className: 'yj-avatar-presets', role: 'group', 'aria-label': t('avatarPresets') }, ...presetAvatars.map((id, index) => h('button', { type: 'button', key: id, className: 'yj-avatar-preset', 'aria-pressed': draft.avatar === avatarArt[id], 'aria-label': `${t('avatarPresets')} ${index + 1}`, disabled: busy, onClick: () => update('avatar', avatarArt[id]) }, h('img', { src: avatarArt[id], alt: '' })))))),
      ...[['name', 'expertName'], ['description', 'expertDescription']].map(([key, label]) => h('label', { key }, t(label), h('input', { value: draft[key], required: true, disabled: busy, maxLength: key === 'name' ? 40 : 240, onChange: event => update(key, event.target.value) }))),
      h('label', null, t('expertPrompt'), h('textarea', { required: true, value: draft.prompt, disabled: busy, onChange: event => update('prompt', event.target.value), spellCheck: false })),
      h('label', null, t('expertModel'), catalog?.modelSupported === false && h('small', { className: 'yj-muted' }, t('modelUnsupported')), h('select', { value: modelValue, disabled: busy || !catalog || catalog.modelSupported === false, onChange: event => update('model', event.target.value ? JSON.parse(event.target.value) : null) }, h('option', { value: '' }, t('inheritModel')), draft.model && !modelOptions.some(item => item.value === modelValue) && h('option', { value: modelValue }, `${draft.model.provider} / ${draft.model.model} · ${t('modelMissing')}`), ...modelOptions.map(item => h('option', { value: item.value, key: item.value }, item.name || item.model || item.id)))),
      selectedModel?.reasoning && h('label', null, t('reasoning'), h('select', { value: draft.model?.reasoningEffort || '', disabled: busy, onChange: event => { const { reasoningEffort, ...model } = draft.model; update('model', event.target.value ? { ...model, reasoningEffort: event.target.value } : model); } }, h('option', { value: '' }, t('reasoningDefault')), ...selectedModel.reasoning.efforts.map(item => h('option', { value: item.id, key: item.id }, item.name)))),
      choices('skills', 'optionalSkills'), catalog?.mcpSupported === false ? h('p', { className: 'yj-muted' }, t('mcpUnsupported')) : choices('mcpServers', 'optionalMcp'), ...(catalog?.issues || []).map(issue => h('p', { key: issue, className: 'yj-notice' }, issue))),
      recovery && h('div', { className: 'yj-notice' }, t('expertRecovery'), h('button', { type: 'button', disabled: busy, onClick: () => { committed.current = recovery; setDraft({ ...recovery, skills: [...recovery.skills], mcpServers: [...recovery.mcpServers] }); setRecovery(null); setError(''); } }, t('loadSavedExpert'))),
      h('footer', { className: 'yj-row' }, h('button', { type: 'button', disabled: busy, onClick: onClose }, t('cancelEdit')), h('button', { type: 'button', className: 'yj-primary', disabled: busy || avatarReading || !catalog || Boolean(recovery), onClick: save }, t(busy ? 'loading' : expert ? 'expertSaveChanges' : 'expertCreate'))));
  }

  return function ExpertsView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, dirty, openAssistant } = useFeature(React, workbench, 'experts');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const [cwd, setCwd] = useState('');
    const [workspaceId, setWorkspaceId] = useState('');
    const [mode, setMode] = useState('');
    const [modes, setModes] = useState([]);
    const [createdSession, setCreatedSession] = useState('');
    const [includeSource, setIncludeSource] = useState(false);
    const registry = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    const roleCards = registry.experts;
    const [expertEditor, setExpertEditor] = useState(undefined);
    const workspaces = useSyncExternalStore(api.subscribeWorkspaces, api.workspaces, api.workspaces);
    const newSession = (roleId, navigate) => run(async () => {
      const id = await api.createExpert(roleId, { cwd, workspaceId, mode });
      let sourceError;
      if (navigate && includeSource) {
        try { await api.request(id, { action: 'status' }); await api.request(id, { action: 'source_add', sessionId: id }); }
        catch (reason) { sourceError = reason; }
      }
      // 创建产生的身份始终保留；登记失败不会诱发重复创建。
      return () => {
        setCreatedSession(id);
        if (sourceError) notify(`${t('sourceRegisterFailed')} (${id}): ${sourceError.message}`, { kind: 'error', ...(navigate ? {} : { action: { label: t('openCreated'), run: () => api.open(id) } }) });
        if (navigate) api.open(id);
      };
    });
    const scope = h('details', { className: 'yj-section' }, h('summary', null, t('advanced')),
      row(field('project', cwd, setCwd), h('label', { className: 'yj-field' }, t('workspace'), h('select', { value: workspaceId, disabled: busy || Boolean(cwd.trim()), onChange: (event) => setWorkspaceId(event.target.value) }, h('option', { value: '' }, t('defaultWorkspace')), ...(workspaces.items || []).map((item) => h('option', { value: item.workspaceId, key: item.workspaceId }, item.name || item.path || item.workspaceId))))));


    const refreshTab = () => run(async () => { await api.loadExperts(); const value = await api.modes(); return () => setModes(value); });
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) { setCreatedSession(reason.sessionId); return false; } setError(reason.message || t('requestFailed')); return true; } });
    useEffect(() => {
      let live = true;
      api.loadExperts().catch(reason => { if (live) setError(reason.message); });
      api.modes().then((value) => { if (live) setModes(value); }, (reason) => { if (live) setError(reason.message || t('requestFailed')); });
      return () => { live = false; };
    }, []);

    let body;
    body = h('section', { className: 'yj-experts' },
      h('div', { className: 'yj-team-heading yj-team-settings' },
        h('details', { className: 'yj-compact-settings' }, h('summary', null, t('advanced')),
          h('label', { className: 'yj-field' }, t('mode'), h('select', { 'aria-label': t('mode'), value: mode, disabled: busy, onChange: event => setMode(event.target.value) }, h('option', { value: '' }, t('defaultMode')), ...modes.map(item => h('option', { key: item.id, value: item.id, disabled: Boolean(item.broken) }, item.name ?? item.id)))), scope,
          h('label', { className: 'yj-check' }, h('input', { type: 'checkbox', checked: includeSource, disabled: busy, onChange: event => setIncludeSource(event.target.checked) }), t('includeSource')))),
      h('div', { className: 'yj-grid' }, ...roleCards.map(role => h('article', { className: 'yj-card', key: role.id },
        h('div', { className: 'yj-card-top' }, h(Avatar, { expert: role, size: 44 }), h('div', { className: 'yj-card-identity' }, h('h2', null, role.name), !role.builtin && h('small', { className: 'yj-muted' }, t('expertCustom'))),
          h(ActionMenu, { label: `${role.name} · ${t('expertOptions')}`, iconOnly: true }, button('editExpert', () => setExpertEditor(role)), button(role.builtin ? 'resetExpert' : 'deleteExpert', () => setConfirm({ kind: 'expert', id: role.id })))), h('p', null, role.description),
        button('start', () => newSession(role.id, true), dirty, { className: 'yj-card-start' }),
        )),
        h('button', { type: 'button', className: 'yj-card yj-add-card', onClick: () => setExpertEditor(null) }, h('span', { className: 'yj-add-mark', 'aria-hidden': true }, '+'), h('h2', null, t('addExpert')))),
      registry.deleted.length > 0 && h('details', { className: 'yj-section' }, h('summary', null, t('deletedExperts'), ` (${registry.deleted.length})`), ...registry.deleted.map(expert => h('div', { key: expert.id, className: 'yj-row' }, expert.name, button('restoreExpert', () => run(async () => { await api.expertRequest({ action: 'restore', id: expert.id, expectedRevision: expert.revision }); await api.loadExperts(); return () => notify(t('expertRestoreDone', { name: expert.name })); }))))),
      (() => {
        const role = confirm?.kind === 'expert' && roleCards.find(item => item.id === confirm.id);
        if (!role) return null;
        const confirmAction = () => run(async () => { const saved = await api.expertRequest({ action: role.builtin ? 'restore' : 'remove', id: role.id, expectedRevision: role.revision }); const actual = await api.loadExperts(); if (role.builtin && !actual.experts.some(item => item.id === saved.expert.id && item.revision === saved.expert.revision)) throw new Error(t('badReply')); return () => { setConfirm(null); notify(t(role.builtin ? 'expertResetDone' : 'expertDeleteDone', { name: role.name })); }; });
        return h(ConfirmDialog, { title: t(role.builtin ? 'expertResetTitle' : 'expertDeleteTitle'), message: [h('p', { key: 'q' }, t(role.builtin ? 'expertConfirmReset' : 'expertConfirmDelete')), h('p', { key: 'h' }, t(role.builtin ? 'expertResetHelp' : 'expertDeleteHelp'))], confirmLabel: t(role.builtin ? 'resetExpert' : 'deleteExpert'), cancelLabel: t('cancel'), danger: !role.builtin, busy, onConfirm: confirmAction, onCancel: () => setConfirm(null) });
      })());

    body = h(React.Fragment, null, body, expertEditor !== undefined && h(ExpertEditor, { key: expertEditor?.id || 'new', api, expert: expertEditor, onClose: () => setExpertEditor(undefined), t, notify }));
    return active ? body : null;
  };
}

export const name = 'whalewing-experts';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'experts', createView, { contract: expertContract, namespace: 'whalewingExperts', entries: registerEntries }); }
