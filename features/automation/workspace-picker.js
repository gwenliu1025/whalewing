/** 定时范围选择只服务定时领域，不作为全局UI公开。 */
export function createWorkspacePicker(React, ActionMenu) {
  const { createElement: h } = React;
  function WorkspacePicker({ items, scope = { mode: 'all', excludedWorkspaceIds: [] }, onChange, disabled, t }) {
    const checked = id => scope.mode === 'all' ? !scope.excludedWorkspaceIds.includes(id) : scope.workspaceIds.includes(id);
    const count = items.filter(item => checked(item.workspaceId)).length;
    const toggle = (id, include) => onChange(scope.mode === 'all'
      ? { mode: 'all', excludedWorkspaceIds: include ? scope.excludedWorkspaceIds.filter(value => value !== id) : [...scope.excludedWorkspaceIds, id] }
      : { mode: 'selected', workspaceIds: include ? [...scope.workspaceIds, id] : scope.workspaceIds.filter(value => value !== id) });
    return h('div', { className: 'yj-field' }, t('workspaceScope'), h(ActionMenu, { label: t('workspaceSelected', { count }) },
      h('label', { className: 'yj-choice' }, h('input', { type: 'checkbox', checked: scope.mode === 'all' && scope.excludedWorkspaceIds.length === 0, disabled, onChange: event => onChange(event.target.checked ? { mode: 'all', excludedWorkspaceIds: [] } : { mode: 'selected', workspaceIds: [] }) }), t('workspaceAll')),
      h('div', { className: 'yj-workspace-options' }, ...items.map(item => h('label', { key: item.workspaceId, className: 'yj-choice' }, h('input', { type: 'checkbox', checked: checked(item.workspaceId), disabled, onChange: event => toggle(item.workspaceId, event.target.checked) }), h('span', null, item.name || item.path, h('small', { className: 'yj-muted' }, item.name ? item.path : '')))))));
  }

  return WorkspacePicker;
}
