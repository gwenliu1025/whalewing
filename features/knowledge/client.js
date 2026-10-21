import { createGraphCanvas } from '../../src/graph-canvas.js';
import { registerEntries } from './entries.js';
import { knowledgeContract } from './contract.js';
import { registerFeature } from '../../src/shell/feature.js';
import { createMarkdown } from '../../src/shell/markdown.js';
import { useFeature } from '../../src/shell/feature.js';

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Glyph, ActionMenu, Modal, ConfirmDialog } = kit;
  const GraphCanvas = createGraphCanvas(React);
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  /** 目录分页只持有可重建列表；打开笔记仍从知识服务读取正文。 */
  function Directory({ api, t, directory = '', selected, disabled, onSelect, selectedPaths, onToggle, version = 0 }) {
    const [listing, setListing] = useState(null);
    const [expanded, setExpanded] = useState([]);
    const [error, setError] = useState('');
    const [offset, setOffset] = useState(0);
    const [retry, setRetry] = useState(0);
    const [loading, setLoading] = useState(true);
    const pages = useRef([]);
    useEffect(() => {
      const controller = new AbortController();
      let live = true;
      setLoading(true);
      api.knowledge({ action: 'browse', directory, offset }, controller.signal).then(value => { if (live) { setListing(value); setError(''); setLoading(false); } }, reason => { if (live) { setError(reason.message); setLoading(false); } });
      return () => { live = false; controller.abort(); };
    }, [directory, offset, version, retry]);
    // Host 在同一目录下统一分页文件夹与笔记，偏移不能仅计数文件。
    const pageSize = (listing?.folders.length || 0) + (listing?.notes.length || 0);
    return h('div', { className: 'yj-directory', role: 'group', 'aria-label': directory || t('allNotes') },
      error && h('div', { role: 'alert' }, error, h('button', { type: 'button', onClick: () => setRetry(value => value + 1) }, t('directoryRetry'))),
      !listing && !error && h('span', { className: 'yj-spinner', role: 'status', 'aria-label': t('directoryLoading') }),
      ...(listing?.folders || []).map(folder => h('div', { key: folder.path }, h('button', { type: 'button', className: 'yj-folder', title: folder.name, 'aria-expanded': expanded.includes(folder.path), onClick: () => setExpanded(value => value.includes(folder.path) ? value.filter(path => path !== folder.path) : [...value, folder.path]) }, h('span', { className: expanded.includes(folder.path) ? 'yj-folder-chevron yj-expanded' : 'yj-folder-chevron' }, h(Glyph, { name: 'chevron', size: 12 })), h(Glyph, { name: 'folder', size: 15 }), h('span', { className: 'yj-tree-title' }, folder.name)),
        expanded.includes(folder.path) && h(Directory, { api, t, directory: folder.path, selected, disabled, onSelect, selectedPaths, onToggle, version }))),
      ...(listing?.notes || []).map(item => h('div', { key: item.path, className: 'yj-note-row' }, h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title }), disabled: disabled || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => onToggle(item.path, event.target.checked) }), h('button', { type: 'button', className: `yj-note ${selected === item.path ? 'yj-selected' : ''}`, disabled, onClick: () => onSelect(item), title: `${item.title}\n${item.path}` }, h(Glyph, { name: 'file', size: 14 }), h('span', { className: 'yj-tree-title' }, item.title)))),
      listing && (offset > 0 || listing.total > pageSize) && h('div', { className: 'yj-row' }, h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || offset === 0, onClick: () => setOffset(pages.current.pop() || 0) }, t('previous')), h('button', { type: 'button', disabled: disabled || loading || Boolean(error) || offset !== listing.offset || !listing.truncated || pageSize === 0, onClick: () => { pages.current.push(listing.offset); setOffset(listing.offset + pageSize); } }, t('next'))));
  }

  function useDirectorySplit(active) {
    const frame = useRef(null);
    const gesture = useRef(null);
    const [width, setWidth] = useState(195);
    const [available, setAvailable] = useState(800);
    const limits = size => ({ min: Math.min(120, Math.max(0, (size - 8) / 3)), max: Math.max(0, Math.min(560, size - 8 - Math.min(240, size / 2))) });
    const clamp = (value, size = available) => { const range = limits(size); return Math.max(range.min, Math.min(value, Math.max(range.min, range.max))); };
    const finish = (event, cancel = false) => {
      const drag = gesture.current;
      if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
      gesture.current = null;
      if (cancel) setWidth(clamp(drag.width));
      if (drag.target.hasPointerCapture(drag.id)) drag.target.releasePointerCapture(drag.id);
    };
    useEffect(() => {
      if (!active || !frame.current) return;
      const resize = () => { finish(); const size = Math.max(0, frame.current.clientWidth); setAvailable(size); setWidth(value => clamp(value, size)); };
      resize();
      const observer = new window.ResizeObserver(resize);
      observer.observe(frame.current);
      return () => { finish(); observer.disconnect(); };
    }, [active]);
    const range = limits(available);
    const value = clamp(width);
    return { frame, width: value, separator: {
      role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-valuemin': Math.round(range.min), 'aria-valuemax': Math.round(Math.max(range.min, range.max)), 'aria-valuenow': Math.round(value),
      onPointerDown: event => { if (event.button !== 0 || gesture.current) return; event.preventDefault(); event.currentTarget.focus(); gesture.current = { id: event.pointerId, target: event.currentTarget, x: event.clientX, width: value }; event.currentTarget.setPointerCapture(event.pointerId); },
      onPointerMove: event => { const drag = gesture.current; if (!drag || event.pointerId !== drag.id) return; event.preventDefault(); setWidth(clamp(drag.width + event.clientX - drag.x)); },
      onPointerUp: event => finish(event), onPointerCancel: event => finish(event, true), onLostPointerCapture: event => finish(event, true),
      onKeyDown: event => {
        if (event.key === 'Escape') { finish(undefined, true); return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setWidth(clamp(event.key === 'Home' ? range.min : event.key === 'End' ? range.max : value + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 24 : 8)));
      },
    } };
  }

  return function KnowledgeView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, openAssistant } = useFeature(React, workbench, 'knowledge');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const directorySplit = useDirectorySplit(active);
    const [status, setStatus] = useState(null);
    const [conflict, setConflict] = useState(false);
    const [readbackPath, setReadbackPath] = useState('');
    const [query, setQuery] = useState('');
    const [notes, setNotes] = useState([]);
    const [truncated, setTruncated] = useState(false);
    const [note, setNote] = useState(null);
    const [path, setPath] = useState('');
    const [content, setContent] = useState('');
    const [restorePath, setRestorePath] = useState('');
    const [validation, setValidation] = useState(null);
    const [editing, setEditing] = useState(false);
    const [location, setLocation] = useState(0);
    const [linkIssue, setLinkIssue] = useState(null);
    const [graph, setGraph] = useState(null);
    const [missingGraph, setMissingGraph] = useState(null);
    const graphRequest = useRef(null);
    const graphLoadingLabel = useRef((done, total) => t('graphPreparing', { done, total }));
    const [graphCenter, setGraphCenter] = useState('');
    const [directoryVersion, setDirectoryVersion] = useState(0);
    const history = useRef([]);
    const dirty = content !== (note?.content || '');
    const selectedPaths = workbench.internal.assistant()?.selectedPaths || [];
    const setSelectedPaths = value => workbench.assistant.setContext(typeof value === 'function' ? value(selectedPaths) : value);
    const sessionId = '';
    const localActions = ['status', 'initialize', 'search', 'read', 'document', 'write', 'remove', 'restore', 'validate', 'graph'];
    const command = (action, extra = {}, id = sessionId) => !extra.domain && localActions.includes(action)
      ? (note?.readOnly && note.path === extra.path && ['write', 'remove', 'restore'].includes(action)
        ? Promise.reject(new Error(t('noteReadOnly')))
        : api.knowledge({ action, ...extra }, operation.current?.controller.signal)).catch(reason => {
        // 同名CONFLICT也来自专家和技能；只有知识正文写入持有编辑保护的归属。
        if (['write', 'remove', 'restore'].includes(action)) reason.notePath = extra.path;
        throw reason;
      })
      : api.request(id, { action, ...extra });
    const refreshNotes = async () => command('search', { query });
    const applyNotes = (value) => { setNotes(value.notes); setTruncated(Boolean(value.truncated)); };
    // 列表是派生视图，其失败不否定已经提交并回读的单文件结果。
    const refreshAfterMutation = async () => {
      try { return { found: await refreshNotes() }; }
      catch (reason) { return { issue: `${t('listRefreshFailed')}：${reason.message}` }; }
    };
    const applyRefreshed = value => { setDirectoryVersion(version => version + 1); if (value.found) applyNotes(value.found); if (value.issue) setError(value.issue); };
    const readAfterMutation = async name => {
      try { return await command('document', { path: name }); }
      // 新建和恢复也可能已落盘；恢复身份不依赖尚未读到的 note，也不被再次读取失败清除。
      catch (reason) { throw Object.assign(new Error(`${t('savedReadback')}：${reason.message}`), { code: 'committed_readback', notePath: name }); }
    };
    const newNote = () => {
      // 用本地日期生成仅在编辑区存在的初稿，路径与正文仍由 Host 校验。
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const title = `${date} ${t('newNoteTitle')}`;
      setNote(null); setPath(`10-收件箱/${title}.md`);
      setContent(`---\ntype: capture\nstatus: inbox\ncreated: ${date}\nupdated: ${date}\naliases: []\n---\n\n# ${title}\n\n`);
      setConflict(false); setConfirm(null);
      setEditing(true); setLocation(0); setLinkIssue(null); setGraph(null); graphRequest.current = null;
    };
    const selectNote = (item, backwards = false) => run(async () => {
      // 缺失节点是图投影，不获得文件读取或自动新建入口。
      if (item.kind === 'missing') return () => setMissingGraph(item);
      const value = await command('document', { path: item.path });
      return () => {
        if (backwards) history.current.pop();
        else if (note && note.path !== value.path) history.current.push({ path: note.path, targetLine: location });
        setNote(value); setPath(value.path); setContent(value.content); setReadbackPath(''); setConflict(false); setConfirm(null); setEditing(false); setLocation(item.targetLine || 0); setLinkIssue(null); setGraph(null); setMissingGraph(null); graphRequest.current = null;
      };
    });
    const openLink = (token) => {
      if (busy || dirty) return;
      const match = /^whalewing-link\/(\d+)\.md$/.exec(token);
      const link = match && note?.links?.[Number(match[1])];
      if (!link) { setError(t('invalidLink')); return; }
      if (link.status !== 'resolved') { setLinkIssue(link); return; }
      return selectNote(link);
    };
    const loadGraph = (center = graphCenter, offset = 0) => run(async () => {
      graphRequest.current = { ...(center ? { path: center } : {}), query: '', offset };
      const value = await command('graph', graphRequest.current);
      return () => { setGraph(value); setGraphCenter(center); setMissingGraph(null); };
    });
    const onError = reason => {
          const isConflict = Boolean(reason.notePath) && /conflict|hash|已.*修改/i.test(`${reason.code || ''} ${reason.message || ''}`);
          const needsReadback = Boolean(reason.notePath) && /readback/i.test(reason.code || '');
          if (needsReadback || (isConflict && reason.notePath !== path)) { setReadbackPath(reason.notePath); setGraph(null); graphRequest.current = null; }
          // 普通查询的结果不解决保存冲突；只由正文的成功回读或写后回执解除。
          setConflict(value => value || isConflict || needsReadback);
          setError(reason.sessionId ? `${t('expertSelectionFailed')} (${reason.sessionId}): ${reason.message}` : isConflict && !needsReadback ? t('conflict') : reason.message || t('requestFailed'), reason.sessionId ? { label: t('openCreated'), run: () => api.open(reason.sessionId) } : undefined);
      return true;
    };
    const refreshTab = ({ entering = false } = {}) => {
      if (entering && (dirty || conflict || readbackPath)) { notify(t('draftWarning'), { kind: 'info' }); return; }
      return run(async () => {
      if (entering) graphRequest.current = { query: '', offset: 0 };
      const id = '';
      const current = await command('status', {}, id);
      let value, nextGraph, graphError;
      if (current.initialized) {
        if (query.trim() || !graphRequest.current) value = await command('search', { query }, id);
        if (graphRequest.current && !dirty && !conflict && !readbackPath) {
          try { nextGraph = await command('graph', graphRequest.current, id); }
          catch (reason) { graphError = reason.message; }
        }
      }
      return () => {
        setStatus(current);
        if (value) applyNotes(value);
        if (nextGraph) { setGraph(nextGraph); setGraphCenter(graphRequest.current.path || ''); setMissingGraph(null); }
        if (graphError) setError(graphError);
      };

      });
    };
    bind({ refresh: refreshTab, blocked: dirty, guard: () => dirty || conflict || readbackPath ? t('draftWarning') : '', onError });
    useLayoutEffect(() => { workbench.internal.assistant()?.currentNote(note?.path || '', dirty); }, [note?.path, dirty]);
    const markdown = createMarkdown(h, { busy, dirty, openLink });
    let graphView;
    if (graph) {
      const paged = graph.offset > 0 || graph.total > graph.nodes.length;
      graphView = h('section', { className: 'yj-graph-workspace', 'aria-label': t(graphCenter ? 'localGraph' : 'graph') },
        graph.nodes.length ? h(GraphCanvas, { graph, selectedPath: path, disabled: busy || dirty, onOpenNote: selectNote, label: t(graphCenter ? 'localGraph' : 'graph'), resetLabel: t('resetGraph'), subscribeTheme: api.subscribeTheme, loadingLabel: graphLoadingLabel.current, canvasErrorLabel: t('graphCanvasError'), dataErrorLabel: t('graphDataError') }) : h('div', { className: 'yj-graph-empty' }, help('graphEmpty')),
        missingGraph && h('div', { className: 'yj-graph-missing', role: 'status' }, h('h3', null, missingGraph.title), help('missingGraphNote'), h('h4', null, t('missingGraphSources')),
          ...missingGraph.sources.map(source => h('div', { key: `${source.path}:${source.line}` }, h('button', { type: 'button', disabled: busy || dirty, onClick: () => selectNote({ path: source.path, targetLine: source.line }) }, `${source.title} · ${source.line}`))), button('closePanel', () => setMissingGraph(null))),
        // 完整单页只呈现画布；有界响应确有省略时才说明范围，不将局部图冒称全库。
        (paged || graph.omittedEdges > 0) && h('div', { className: 'yj-graph-controls', 'aria-label': t('graphRange') },
          paged && button('previous', () => loadGraph(graphCenter, Math.max(0, graph.offset - status.limits.maxGraphNodes)), graph.offset === 0),
          paged && h('span', null, t('graphPage', { from: graph.nodes.length ? graph.offset + 1 : 0, to: graph.offset + graph.nodes.length, total: graph.total })),
          paged && button('next', () => loadGraph(graphCenter, graph.offset + graph.nodes.length), graph.offset + graph.nodes.length >= graph.total || !graph.nodes.length),
          graph.omittedEdges > 0 && h('span', { title: t('graphOmitted', { count: graph.omittedEdges }) }, t('graphPartial'))));
    }

    let body;
    body = h('section', { className: 'yj-knowledge' },
      h('div', { className: 'yj-knowledge-toolbar' },
        h('label', { className: 'yj-search' }, h(Glyph, { name: 'search', size: 16 }), h('input', { 'aria-label': t('query'), placeholder: t('searchPlaceholder'), value: query, disabled: busy, onChange: event => setQuery(event.target.value), onKeyDown: event => { if (event.key === 'Enter') run(async () => { const value = await refreshNotes(); return () => applyNotes(value); }); } })),
        button('search', () => run(async () => { const value = await refreshNotes(); return () => applyNotes(value); }), !status?.initialized, { className: 'yj-ghost' }),
        button('newNote', newNote, !status?.initialized || dirty || Boolean(readbackPath), { className: 'yj-ghost' }),
        button('graph', () => loadGraph(''), !status?.initialized || dirty || conflict || Boolean(readbackPath), { className: 'yj-ghost' }),
        h(ActionMenu, { label: t('libraryTools'), iconOnly: true }, button('localGraph', () => loadGraph(note.path), !note || dirty || conflict || Boolean(readbackPath)), button('validate', () => run(async () => { const value = await command('validate'); return () => setValidation(value); }), !status?.initialized),
          h('details', null, h('summary', null, t('restore')), row(field('restorePath', restorePath, setRestorePath), button('restore', () => run(async () => { await command('restore', { path: restorePath, expectedHash: '' }); const value = await readAfterMutation(restorePath); const refreshed = await refreshAfterMutation(); return () => { setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setEditing(false); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); }; }, 'restored'), !status?.initialized || !restorePath.trim() || dirty || Boolean(readbackPath) || Boolean(note?.readOnly && note.path === restorePath)))),
          h('details', null, h('summary', null, t('root')), status ? h('p', null, status.root, status.locationNotice && h('span', null, status.locationNotice)) : help('preparing')))),
      validation && h(Modal, { title: t('validation'), onClose: () => setValidation(null), className: 'yj-confirm' }, h('div', { className: 'yj-confirm-body' }, h('p', null, t(validation.valid ? 'valid' : 'invalid', { count: validation.notes })), ...(validation.issues || []).map((issue, i) => h('p', { key: i }, issue))), h('footer', { className: 'yj-dialog-actions' }, button('closePanel', () => setValidation(null), false, { className: 'yj-primary' }))),
      // search 的截断只描述当前搜索列表，不代表独立目录或图谱缺失数据。
      Boolean(query.trim()) && notes.length > 0 && truncated && help('truncated'),
      h('div', { className: 'yj-knowledge-split', ref: directorySplit.frame, style: { '--yj-directory-width': `${directorySplit.width}px` } }, h('aside', { className: 'yj-note-tree', 'aria-label': t('notes') },
        query.trim() ? notes.length ? notes.map(item => h('div', { key: item.path, className: 'yj-note-row' },
          h('input', { type: 'checkbox', checked: selectedPaths.includes(item.path), 'aria-label': t('selectForQuestion', { name: item.title || item.path }), disabled: busy || (!selectedPaths.includes(item.path) && selectedPaths.length >= 12), onChange: event => { setSelectedPaths(event.target.checked ? [...selectedPaths, item.path] : selectedPaths.filter(value => value !== item.path)); } }),
          h('button', { type: 'button', className: 'yj-note', disabled: busy || dirty, title: `${item.title || item.path}\n${item.path}`, onClick: () => selectNote(item) }, h('span', { className: 'yj-tree-title' }, item.title || item.path)))) : help('emptyNotes') : h(Directory, { api, t, selected: path, disabled: busy || dirty, onSelect: selectNote, selectedPaths, version: directoryVersion, onToggle: (name, selected) => { setSelectedPaths(value => selected ? [...value, name] : value.filter(path => path !== name)); } })),
        h('div', { ...directorySplit.separator, className: 'yj-directory-separator', 'aria-label': t('directoryResize') }),
        h('div', { className: graphView ? 'yj-note-canvas yj-graph-mode' : 'yj-note-canvas' }, graphView || h(React.Fragment, null, h('div', { className: 'yj-note-toolbar' }, h('details', { className: 'yj-note-path', open: editing }, h('summary', { title: path }, h(Glyph, { name: 'file', size: 14 }), path.split('/').at(-1) || t('noteDetails')), field('notePath', path, setPath, { readOnly: Boolean(note || readbackPath) })),
          row(button('read', () => note ? setEditing(false) : selectNote({ path }), !path.trim() || dirty), button('edit', () => { if (!note?.readOnly) setEditing(true); }, !status?.initialized || Boolean(note?.readOnly)), button('back', () => selectNote(history.current.at(-1), true), !history.current.length || dirty)),
            dirty && h('span', { className: 'yj-draft-chip', role: 'status' }, t('draftDirty'), h('button', { type: 'button', onClick: () => setConfirm({ kind: 'draft' }) }, t('discard')))),
          note?.readOnly && h('div', { className: 'yj-notice', role: 'status' }, t('noteReadOnly')),
          editing ? h('label', null, t('content'), h('textarea', { 'aria-label': t('content'), value: content, disabled: busy || !status?.initialized, onChange: (event) => setContent(event.target.value), spellCheck: false })) : note ? h('div', { className: 'yj-reader', 'aria-label': t('reading') },
            location > 1 && h('div', { className: 'yj-location' }, h('h3', null, t('locate', { line: location })), h('pre', null, note.content.replace(/\r\n/g, '\n').split('\n').slice(location - 1, location + 5).join('\n')), button('clearLocate', () => setLocation(0))),
            markdown(note.view)) : help('selectNote'),
          linkIssue && h('div', { className: 'yj-notice', role: 'status' }, t(linkIssue.status === 'ambiguous' ? 'linkAmbiguous' : linkIssue.status.startsWith('fragment_') ? 'fragmentMissing' : linkIssue.status === 'attachment' ? 'linkAttachment' : linkIssue.status === 'invalid' ? 'invalidLink' : 'linkMissing'), `：${linkIssue.target}`,
            ...linkIssue.candidates.map(candidate => h('button', { type: 'button', key: candidate, disabled: busy || dirty, onClick: () => selectNote({ path: candidate }) }, candidate)), linkIssue.candidateTotal > linkIssue.candidates.length && help('truncated'), linkIssue.path && button('read', () => selectNote({ path: linkIssue.path }), dirty)),
          note?.relationsIssue && h('div', { className: 'yj-notice', role: 'status' }, t('relationsUnavailable'), `：${note.relationsIssue}`),
          note && !note.relationsIssue && h('details', null, h('summary', null, t('outgoing')), ...(note.links || []).map((link, i) => h('div', { key: i }, h('button', { type: 'button', disabled: busy || dirty, onClick: () => openLink(`whalewing-link/${i}.md`) }, link.label), ` · ${link.status}`))),
          note && !note.relationsIssue && h('details', { className: 'yj-backlinks' }, h('summary', null, t('backlinks')), note.backlinks?.length ? note.backlinks.map((link, i) => h('button', { type: 'button', key: i, disabled: busy || dirty, onClick: () => selectNote({ path: link.path, targetLine: link.line }) }, `${link.title} · ${link.line}`)) : help('noBacklinks'), note.totalBacklinks > note.backlinks?.length && help('truncated')),
          editing && help('draftWarning'),
          h('details', { className: 'yj-note-actions', open: editing || conflict || Boolean(readbackPath) }, h('summary', null, t('more')), row(button('save', () => run(async () => {
            const saved = await command('write', { path, content, expectedHash: note?.hash || '' });
            const value = await readAfterMutation(path); const refreshed = await refreshAfterMutation();
            if (saved.hash !== value.hash) throw Object.assign(new Error(t('conflict')), { code: 'conflict', notePath: path });
            return () => { setNote(value); setPath(value.path); setContent(value.content); setConflict(false); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); };
          }, 'saved'), !status?.initialized || !path.trim() || Boolean(readbackPath) || Boolean(note?.readOnly)),
          button('reload', () => selectNote({ path: readbackPath || path }), !readbackPath && (!path.trim() || !conflict)),
          h('a', { download: path.split(/[\\/]/).at(-1) || 'note.md', href: `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}` }, t('export')),
          button('remove', () => { if (!note?.readOnly) setConfirm({ kind: 'note', path }); }, !note || dirty || Boolean(readbackPath) || Boolean(note?.readOnly)))),
          (conflict || readbackPath) && help('reloadHelp'),
           confirm?.kind === 'note' && h(ConfirmDialog, { title: t('noteRemoveTitle'), message: t('confirmRemove'), confirmLabel: t('remove'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => run(async () => { await command('remove', { path: note.path, expectedHash: note.hash }); const refreshed = await refreshAfterMutation(); return () => { setNote(null); setPath(''); setContent(''); setConflict(false); setConfirm(null); setGraph(null); graphRequest.current = null; applyRefreshed(refreshed); }; }, 'deleted') })))),
);

    body = h(React.Fragment, null, body, confirm?.kind === 'draft' && h(ConfirmDialog, { title: t('draftDiscardTitle'), message: t('confirmDiscard'), confirmLabel: t('discard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setContent(note?.content || ''); if (!note) setPath(''); setConfirm(null); notify(t('draftDiscarded')); } }));
    return active ? body : null;
  };
}

export const name = 'whalewing-knowledge';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'knowledge', createView, { contract: knowledgeContract, namespace: 'whalewingKnowledge', entries: registerEntries }); }
