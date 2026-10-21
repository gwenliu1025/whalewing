import { newsContract } from './contract.js';
import { registerFeature } from '../../src/shell/feature.js';
import { createMarkdown } from '../../src/shell/markdown.js';
import { useFeature } from '../../src/shell/feature.js';

/** 本页持有自己的草稿、动作和恢复状态；切走时不把状态交给外壳。 */
export function createView(kit) {
  const { React, Glyph, ActionMenu, Modal, ConfirmDialog, Drawer } = kit;
  const { createElement: h, useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore } = React;
  function BookReader({ title, accent, onClose, t, children }) {
    const dialog = useRef(null), viewport = useRef(null), flow = useRef(null);
    const [view, setView] = useState({ page: 0, pages: 1, columns: 1, spread: 1, toc: [] });
    const [size, setSize] = useState(1);
    const state = useRef({ page: 0, pages: 1, step: 1 }), wheel = useRef({ sum: 0, at: 0, last: 0 }), alive = useRef(true);
    const go = (target, smooth = true) => {
      const { pages, step } = state.current, page = Math.max(0, Math.min(pages - 1, target));
      state.current.page = page;
      viewport.current?.scrollTo({ left: page * step, behavior: smooth && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
      setView(value => value.page === page ? value : { ...value, page });
    };
    const measure = () => {
      const box = viewport.current, content = flow.current;
      if (!alive.current || !box || !content || !box.clientWidth) return;
      const width = box.clientWidth, spread = width >= 760 ? 2 : 1, gap = spread === 2 ? 96 : 56;
      content.style.columnCount = String(spread); content.style.columnGap = `${gap}px`;
      const step = width + gap, column = (width - gap * (spread - 1)) / spread;
      const columns = Math.max(1, Math.round((box.scrollWidth + gap) / (column + gap))), pages = Math.max(1, Math.ceil(columns / spread));
      const ratio = state.current.pages > 1 ? state.current.page / (state.current.pages - 1) : 0, page = Math.round(ratio * (pages - 1));
      const rendered = content.querySelectorAll('.yj-rendered h1, .yj-rendered h2').length ? '.yj-rendered h1, .yj-rendered h2' : '.yj-rendered h3';
      const toc = [...content.querySelectorAll(`[data-book-toc], ${rendered}`)].map(element => ({ label: (element.dataset.bookToc || element.textContent).trim(), page: Math.max(0, Math.min(pages - 1, Math.floor(element.offsetLeft / step))), sub: !element.hasAttribute('data-book-toc') })).filter(entry => entry.label).slice(0, 80);
      state.current = { page, pages, step };
      box.scrollTo({ left: page * step, behavior: 'auto' });
      setView({ page, pages, columns, spread, toc });
    };
    useEffect(() => {
      const previous = document.activeElement, content = flow.current;
      dialog.current?.showModal();
      measure();
      const observer = typeof ResizeObserver === 'function' && viewport.current ? new ResizeObserver(() => measure()) : null;
      observer?.observe(viewport.current);
      content?.addEventListener('load', measure, true);
      document.fonts?.ready?.then(measure);
      return () => { alive.current = false; observer?.disconnect(); content?.removeEventListener('load', measure, true); dialog.current?.close(); if (previous?.isConnected) previous.focus(); };
    }, []);
    useEffect(() => { measure(); }, [size]);
    const onKeyDown = event => {
      const key = event.key;
      if (event.target.closest?.('input, textarea, select, [popover]') || key === ' ' && event.target.closest?.('button, a')) return;
      const target = ['ArrowRight', 'PageDown', ' '].includes(key) ? state.current.page + 1 : ['ArrowLeft', 'PageUp'].includes(key) ? state.current.page - 1 : key === 'Home' ? 0 : key === 'End' ? state.current.pages - 1 : null;
      if (target === null) return;
      event.preventDefault(); go(target);
    };
    const onWheel = event => {
      if (event.target.closest?.('pre, .yj-table') && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const now = Date.now(), record = wheel.current, delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (now - record.last > 240) record.sum = 0;
      record.last = now;
      if (now - record.at < 450) return;
      record.sum += delta;
      if (Math.abs(record.sum) >= 50) { record.at = now; go(state.current.page + Math.sign(record.sum)); record.sum = 0; }
    };
    const chapter = view.toc.filter(entry => entry.page <= view.page).at(-1);
    const first = view.page * view.spread + 1, second = view.spread === 2 && first + 1 <= view.columns ? first + 1 : null;
    return h('dialog', { ref: dialog, className: 'yj-modal yj-page yj-book', 'aria-label': title, style: { '--yj-accent': accent, '--yj-book-size': ['15px', '16.5px', '18px'][size] }, onKeyDown,
      onCancel: event => { event.preventDefault(); onClose(); }, onClick: event => { if (event.target === event.currentTarget) onClose(); } },
      h('header', { className: 'yj-book-bar' },
        view.toc.length > 0 ? h(ActionMenu, { label: t('bookToc'), icon: 'list' }, ...view.toc.map((entry, index) => h('button', { type: 'button', key: index, className: `yj-toc-item${entry.sub ? ' yj-toc-sub' : ''}${entry === chapter ? ' yj-toc-current' : ''}`, onClick: () => go(entry.page) }, h('span', null, entry.label), h('small', null, entry.page * view.spread + 1)))) : h('span', null),
        h('p', { className: 'yj-book-title' }, title),
        h('div', { className: 'yj-book-tools' },
          h('button', { type: 'button', className: 'yj-icon-button', title: t('bookSmaller'), 'aria-label': t('bookSmaller'), disabled: size === 0, onClick: () => setSize(value => Math.max(0, value - 1)) }, 'A−'),
          h('button', { type: 'button', className: 'yj-icon-button', title: t('bookLarger'), 'aria-label': t('bookLarger'), disabled: size === 2, onClick: () => setSize(value => Math.min(2, value + 1)) }, 'A+'),
          h('button', { type: 'button', className: 'yj-icon-button', title: t('closePanel'), 'aria-label': t('closePanel'), onClick: onClose }, h(Glyph, { name: 'close' })))),
      h('div', { className: `yj-book-stage${view.spread === 2 ? ' yj-book-spread' : ''}`, onWheel },
        h('button', { type: 'button', className: 'yj-book-edge yj-book-prev', 'aria-label': t('bookPrev'), title: t('bookPrev'), disabled: view.page === 0, onClick: () => go(view.page - 1) }, h(Glyph, { name: 'back', size: 22 })),
        h('div', { ref: viewport, className: 'yj-book-viewport' }, h('div', { ref: flow, className: 'yj-book-flow' }, children)),
        h('button', { type: 'button', className: 'yj-book-edge yj-book-next', 'aria-label': t('bookNext'), title: t('bookNext'), disabled: view.page >= view.pages - 1, onClick: () => go(view.page + 1) }, h(Glyph, { name: 'chevron', size: 22 }))),
      h('footer', { className: 'yj-book-foot' },
        h('span', { className: 'yj-book-folio' }, first),
        h('div', { className: 'yj-book-progress' }, h('span', null, chapter?.label ?? title),
          h('div', { className: 'yj-book-track', role: 'progressbar', 'aria-label': t('bookProgress'), 'aria-valuemin': 1, 'aria-valuemax': view.pages, 'aria-valuenow': view.page + 1 }, h('i', { style: { width: `${(view.page + 1) / view.pages * 100}%` } }))),
        h('span', { className: 'yj-book-folio' }, view.spread === 2 ? second ?? '' : `/ ${view.columns}`)));
  }

  return function CardsView({ active, workbench }) {
    const { api, t, notify, busy, run, operation, setError: reportError, button, field, row, help, bind, dirty, openAssistant } = useFeature(React, workbench, 'cards');
    const setError = (message, action) => reportError(message, action || { label: t('retry'), run: () => refreshTab() });
    const [confirm, setConfirm] = useState(null);
    const [newsSettings, setNewsSettings] = useState(false);
    const [newsData, setNewsData] = useState(null);
    const [newsHome, setNewsHome] = useState(null);
    const [learningArticle, setLearningArticle] = useState(null);
    const [newsItem, setNewsItem] = useState(null);
    const [newsExpanded, setNewsExpanded] = useState({});
    const [newsRun, setNewsRun] = useState(null);
    const [newsEditor, setNewsEditor] = useState(null);
    const [newsSource, setNewsSource] = useState({ name: '', url: '', kind: '', region: '' });
    const [newsHistory, setNewsHistory] = useState(null);
    const [newsAbout, setNewsAbout] = useState(false);
    const [newsReport, setNewsReport] = useState(null);
    const externalLink = (url, label) => {
      // 来源是外部资料；渲染边界不把非网页协议变成可点击命令。
      try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label); } catch { /* 非法链接仍显示来源文字，不猜测修正地址。 */ }
      return h('span', null, label);
    };
    const editNews = field => {
      if (newsEditor) return;
      setNewsEditor(field ? { id: field.id, expectedRevision: field.revision, field: { name: field.name, focus: field.focus, enabled: field.enabled, sources: field.sources.map(source => ({ ...source })) } } : { id: `field-${globalThis.crypto.randomUUID()}`, expectedRevision: 0, field: { name: '', focus: '', enabled: false, sources: [] } });
      setNewsSource({ name: '', url: '', kind: '', region: '' });
    };
    const closesNews = input => {
      const current = newsData?.fields.find(field => field.id === input.id);
      return current?.enabled && (input.action === 'remove' || !input.field.enabled) && !newsData.fields.some(field => field.id !== input.id && field.enabled) && newsData.schedules.some(task => task.status === 'active');
    };
    const persistNews = input => run(async () => {
      const signal = operation.current?.controller.signal;
      try {
        const saved = await api.newsRequest(input, signal);
        const current = await api.newsRequest({ action: 'list' }, signal);
        const field = current.fields.find(item => item.id === input.id);
        if (input.action === 'remove' ? !saved.field.deleted || Boolean(field) : !field || JSON.stringify(field) !== JSON.stringify(saved.field)) throw new Error(t('newsReadback'));
        return () => { setNewsData(current); setNewsEditor(null); setConfirm(null); notify(t(input.action === 'remove' ? 'newsRemoved' : 'newsSaved')); };
      } catch (reason) {
        if (reason.code === 'NEWS_CANCEL_CONFIRM') return () => setConfirm({ kind: 'newsChange', input, last: true });
        // 计划可能已经取消但配置尚未保存；按 owner 回读事实，不补建计划或丢弃草稿。
        let current;
        try { current = await api.newsRequest({ action: 'list' }, signal); } catch { /* 原错误与上次画面保留，等待员工明确回读。 */ }
        return () => { if (current) setNewsData(current); setError(`${t('newsWriteUnknown')}：${reason.message}`); };
      }
    });
    const saveNews = () => {
      const input = { action: 'save', ...newsEditor };
      if (closesNews(input)) { setConfirm({ kind: 'newsChange', input, last: true }); return; }
      return persistNews(input);
    };
    const reloadNewsEditor = () => run(async () => {
      const value = await api.newsRequest({ action: 'list' }, operation.current?.controller.signal);
      const current = value.fields.find(field => field.id === newsEditor.id);
      if (!current) throw new Error(t('newsReadback'));
      return () => { setNewsData(value); setNewsEditor(editor => ({ ...editor, expectedRevision: current.revision })); };
    });
    const readNewsReport = (fieldId, cutoff, name) => run(async () => {
      const value = await api.newsRequest({ action: 'report', fieldId, cutoff }, operation.current?.controller.signal);
      return () => setNewsReport({ fieldId, cutoff, name, report: value.report });
    });
    const readNewsHistory = (field, before) => run(async () => {
      const value = await api.newsRequest({ action: 'reports', fieldId: field.id, ...(before ? { before } : {}) }, operation.current?.controller.signal);
      return () => setNewsHistory({ field, reports: before ? [...newsHistory.reports, ...value.reports] : value.reports, nextBefore: value.nextBefore });
    });
    const openNewsSettings = () => run(async () => {
      const value = await api.newsRequest({ action: 'list' }, operation.current?.controller.signal);
      return () => { setNewsData(value); setNewsSettings(true); };
    });
    const closeNewsSettings = () => run(async () => {
      const value = await api.newsRequest({ action: 'home' }, operation.current?.controller.signal);
      return () => { setNewsHome(value); setNewsSettings(false); };
    });
    const beijing = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value)) : t('newsUnverified');
    const markdown = createMarkdown(h);
    const refreshTab = () => run(async () => { const value = await api.newsRequest({ action: newsSettings ? 'list' : 'home' }, operation.current?.controller.signal); return () => newsSettings ? setNewsData(value) : setNewsHome(value); });
    bind({ refresh: refreshTab, onError: reason => { if (reason.sessionId) return false; setError(reason.message || t('requestFailed')); return true; } });

    let body;
      const choices = [...new Map([...(newsData?.defaults.sources || []), ...(newsData?.fields || []).flatMap(field => field.sources), ...(newsEditor?.field.sources || [])].map(source => [source.url, source])).values()];
      const patchNews = (key, value) => setNewsEditor(editor => ({ ...editor, field: { ...editor.field, [key]: value } }));
      const toggleSource = source => patchNews('sources', newsEditor.field.sources.some(item => item.url === source.url) ? newsEditor.field.sources.filter(item => item.url !== source.url) : [...newsEditor.field.sources, { ...source }]);
      // 知识卡片首页：今日学习与每日资讯共用一套“卡片架”——同样的表头、卡片底板、角标与悬停反馈。学习是书卡（书脊 + 叠页），资讯是标题卡（类别图标 + 来源徽记），只放标题，点开在弹框里读。
      const newsAccents = { model: '#6366f1', agent: '#0d9488', opensource: '#d97706', media: '#db2777', research: '#0284c7' }, learningAccents = { 管理: '#4f46e5', 经济: '#0f766e', 'AI 工具技巧': '#9333ea' };
      const newsIcons = { model: 'chip', agent: 'bot', opensource: 'code', media: 'image', research: 'flask' }, brand = 'var(--dsw-alias-brand-primary)';
      const accent = item => newsAccents[item.category] ?? brand;
      const monoColors = ['#2563eb', '#0d9488', '#d97706', '#db2777', '#7c3aed', '#0284c7', '#65a30d', '#e11d48'];
      const monoColor = name => monoColors[[...(name || '')].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) >>> 0, 7) % monoColors.length];
      const dayOf = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(value));
      const when = value => {
        if (!value) return '';
        const day = dayOf(value), clock = beijing(value).slice(11, 16);
        return day === dayOf(Date.now()) ? `${t('newsToday')} ${clock}` : day === dayOf(Date.now() - 86400000) ? `${t('newsYesterday')} ${clock}` : `${day.slice(5).replace('-', '/')} ${clock}`;
      };
      const pressable = open => ({ role: 'button', tabIndex: 0, onClick: open, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } } });
      const shelfHead = (icon, eyebrow, title, meta, actions) => h('div', { className: 'yj-shelf-head' },
        h('div', null, h('p', { className: 'yj-shelf-eyebrow' }, h(Glyph, { name: icon, size: 14 }), eyebrow), h('h3', null, title), meta && h('small', { className: 'yj-muted' }, meta)),
        actions && h('div', { className: 'yj-row' }, ...actions));
      const tileTop = (icon, kicker, ...extra) => h('div', { className: 'yj-tile-top' }, h('span', { className: 'yj-tile-icon', 'aria-hidden': true }, h(Glyph, { name: icon, size: 15 })), h('span', { className: 'yj-tile-kicker' }, kicker), ...extra);
      const newsFlag = item => item.label === 'headline' ? h('span', { className: 'yj-brief-flag yj-brief-flag-media' }, t('newsHeadline')) : item.label === 'leak' ? h('span', { className: 'yj-brief-flag' }, t('newsLeak')) : item.label === 'media' ? h('span', { className: 'yj-brief-flag yj-brief-flag-media' }, t('newsMediaOnly')) : null;
      const newsKicker = item => item.category ? t(`newsCat_${item.category}`) : t('newsKicker');
      const newsCard = (report, item, i, total) => {
        const source = item.sources[0], name = source?.source.name;
        return h('article', { key: item.eventKey, className: 'yj-tile yj-news-tile', style: { '--yj-accent': accent(item) }, ...pressable(() => setNewsItem({ item, index: i, total, fieldName: report.fieldName })) },
          tileTop(newsIcons[item.category] ?? 'news', newsKicker(item), newsFlag(item), h('span', { className: 'yj-tile-num', 'aria-hidden': true }, String(i + 1).padStart(2, '0'))),
          h('h4', { className: 'yj-tile-title' }, item.title),
          h('div', { className: 'yj-tile-foot' },
            h('span', { className: 'yj-tile-source' }, name && h('span', { className: 'yj-tile-mono', style: { '--yj-mono': monoColor(name) }, 'aria-hidden': true }, name.trim().charAt(0).toUpperCase()), h('span', null, [name, when(source?.publishedAt)].filter(Boolean).join(' · '))),
            h('span', { className: 'yj-tile-go', 'aria-hidden': true }, '→')));
      };
      const reportView = report => {
        const key = `${report.fieldId}:${report.cutoff}`, items = report.items.slice(0, 8), expanded = Boolean(newsExpanded[key]);
        return h('section', { className: 'yj-shelf', key },
          shelfHead('news', t('newsDaily'), report.fieldName, [t('newsCutoff', { time: beijing(report.cutoff).slice(0, 16) }), items.length > 0 && t('newsCount', { count: items.length }), report.status !== 'complete' && t(report.status === 'partial' ? 'newsPartial' : 'newsEmpty')].filter(Boolean).join(' · '),
            [button('newsDiagnostics', () => setNewsRun(report)), button('newsReports', () => readNewsHistory({ id: report.fieldId, name: report.fieldName }))]),
          items.length > 0 && h('div', { className: 'yj-shelf-grid yj-shelf-news' }, ...items.slice(0, expanded ? 8 : 4).map((item, i) => newsCard(report, item, i, items.length))),
          items.length > 4 && h('button', { type: 'button', className: 'yj-brief-more', 'aria-expanded': expanded, title: t('newsMoreLabel'), onClick: () => setNewsExpanded(state => ({ ...state, [key]: !expanded })) },
            expanded ? t('newsLess') : t('newsMore', { count: items.length - 4 }), h('span', { className: 'yj-brief-chevron', 'aria-hidden': true })));
      };
      // 阅读时长按中文约 450 字 / 分钟、英文约 220 词 / 分钟估算。
      const minutes = card => Math.max(1, Math.round(card.sections.flatMap(section => section.paragraphs).join('').length / 450 + (card.article.language === 'en' ? card.article.body.split(/\s+/).length / 220 : card.article.body.length / 450)));
      const learningDate = date => { const [year, month, day] = date.split('-').map(Number); return t('learningDate', { month, day, week: '日一二三四五六'[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] }); };
      const learningAccent = card => learningAccents[card.category] ?? brand;
      const learningShelf = learning => h('section', { className: 'yj-shelf' },
        shelfHead('book', t('newsLearning'), learningDate(learning.date), t('learningMeta', { count: learning.cards.length, minutes: learning.cards.reduce((sum, card) => sum + minutes(card), 0) })),
        h('div', { className: 'yj-shelf-grid yj-shelf-books' }, ...learning.cards.map(card => h('article', { className: 'yj-tile yj-book-tile', key: card.id, style: { '--yj-accent': learningAccent(card) }, ...pressable(() => setLearningArticle(card)) },
          tileTop('book', card.category, card.review && h('span', { className: 'yj-tile-badge' }, t('newsLearningReview'))),
          h('h4', { className: 'yj-tile-title' }, card.title),
          h('p', { className: 'yj-tile-text' }, card.concept),
          card.recommendation.kind === 'knowledge' && h('p', { className: 'yj-tile-note' }, card.recommendation.reason),
          h('div', { className: 'yj-tile-foot' },
            h('span', { className: 'yj-tile-source' }, h(Glyph, { name: 'clock', size: 13 }), h('span', null, t('learningMinutes', { minutes: minutes(card) }), ' · ', t('learningPoints', { count: card.highlights.length }))),
            h('span', { className: 'yj-tile-go', 'aria-hidden': true }, t('learningOpen'), ' →'))))));
      const learningBook = card => h(BookReader, { title: card.title, accent: learningAccent(card), t, onClose: () => setLearningArticle(null) },
        h('section', { className: 'yj-book-cover' },
          h('p', { className: 'yj-book-kicker' }, h(Glyph, { name: 'book', size: 15 }), card.category, card.review && ` · ${t('newsLearningReview')}`),
          h('h1', { 'data-book-toc': t('bookCover') }, card.title),
          h('p', { className: 'yj-book-lede' }, card.concept),
          h('div', { className: 'yj-book-rule', 'aria-hidden': true }),
          h('h4', null, t('learningHighlights')),
          h('ol', { className: 'yj-book-points' }, ...card.highlights.map(point => h('li', { key: point }, point))),
          h('aside', { className: 'yj-book-example' }, h('strong', null, t('learningExample')), h('p', null, card.example)),
          h('p', { className: 'yj-book-meta' }, [t('learningMinutes', { minutes: minutes(card) }), card.source.publisher, card.recommendation.kind === 'knowledge' && card.recommendation.reason].filter(Boolean).join(' · '))),
        ...card.sections.map(section => h('section', { key: section.title, className: 'yj-book-chapter' }, h('h2', { 'data-book-toc': '' }, section.title), ...section.paragraphs.map((paragraph, index) => h('p', { key: index }, paragraph)))),
        h('section', { className: 'yj-book-chapter' }, h('h2', { 'data-book-toc': '' }, t('learningText')), h('div', { className: 'yj-rendered', lang: card.article.language }, markdown(card.article.view))),
        h('footer', { className: 'yj-book-colophon' }, h('p', { className: 'yj-book-end', 'aria-hidden': true }, '—  ', t('bookEnd'), '  —'),
          h('h3', null, t('learningSource')), h('p', null, externalLink(card.source.url, card.source.title)), h('p', null, card.source.attribution), h('p', null, card.source.usage), h('p', null, externalLink(card.source.licenseUrl, card.source.license))));
      const newsItemView = ({ item, index, total, fieldName }) => h(Modal, { title: item.title, onClose: () => setNewsItem(null) },
        h('div', { className: 'yj-brief-detail', style: { '--yj-accent': accent(item) } },
          h('div', { className: 'yj-brief-meta' }, tileTop(newsIcons[item.category] ?? 'news', newsKicker(item), newsFlag(item), h('span', { className: 'yj-muted' }, fieldName, ' · ', `${index + 1} / ${total}`))),
          item.brief !== undefined
            ? h(React.Fragment, null, h('p', { className: 'yj-brief-lead' }, item.brief), item.relevance && h('section', null, h('h3', null, t('newsRelevance')), h('p', null, item.relevance)))
            : h(React.Fragment, null, h('p', { className: 'yj-brief-lead' }, item.summary), h('section', null, h('h3', null, t('newsImportance')), h('p', null, item.importance)), h('section', null, h('h3', null, t('newsRelevance')), h('p', null, item.relevance)), h('section', null, h('h3', null, t('newsImpact')), h('p', null, item.workImpact))),
          h('footer', { className: 'yj-brief-sources' },
            item.link && h('p', null, h('strong', null, t('newsViewSource')), externalLink(item.link, item.link.replace(/^https:\/\/(www\.)?/, ''))),
            h('h3', null, t('newsSourcesTitle')),
            h('ul', null, ...item.sources.map(source => h('li', { key: source.id }, externalLink(source.url, source.source.name), h('small', { className: 'yj-muted' }, ' · ', beijing(source.publishedAt))))))));
      const newsRunView = report => h(Modal, { title: `${report.fieldName} · ${t('newsDiagnostics')}`, onClose: () => setNewsRun(null) },
        h('div', { className: 'yj-brief-detail' }, h('p', null, t('newsWindow'), ' · ', beijing(report.start), ' — ', beijing(report.cutoff)), h('p', null, report.coverage),
          ...report.sourceStatus.filter(source => source.status === 'failed').map(source => h('p', { key: source.url, className: 'yj-error' }, source.name, ' · ', source.message)),
          button('newsOpenSession', () => run(async () => api.openAutomation(report.sessionId)))));
      body = h('section', { className: 'yj-news' },
        h('header', { className: 'yj-news-header' }, h('h2', null, t(newsSettings ? 'newsSettings' : 'news')), newsSettings ? button('newsSettingsClose', closeNewsSettings) : button('newsSettings', openNewsSettings)),
        !newsSettings && newsHome && h(React.Fragment, null,
          learningShelf(newsHome.learning),
          newsHome.learning.context.status === 'unavailable' && h('p', { className: 'yj-notice', role: 'status' }, newsHome.learning.context.issue),
          learningArticle && learningBook(learningArticle),
          newsHome.reports.length ? newsHome.reports.map(reportView) : h('section', { className: 'yj-shelf' }, shelfHead('news', t('newsDaily'), t('newsReportEmpty')))),
        newsSettings && newsData && h('section', { className: 'yj-news-settings' },
          h('div', { className: 'yj-news-toolbar' }, button('newsConfigureSchedule', () => { return workbench.openTab('automation'); }), button('newsSources', () => setNewsAbout(true))),
          h('div', { className: 'yj-grid' }, ...newsData.fields.map(field => h('article', { className: 'yj-card yj-news-field', key: field.id },
            h('div', { className: 'yj-card-top' }, h('div', { className: 'yj-card-identity' }, h('h2', null, field.name), !field.enabled && h('small', { className: 'yj-muted' }, t('taskPaused'))),
              h(ActionMenu, { label: `${field.name} · ${t('newsEdit')}`, iconOnly: true }, button('newsEdit', () => editNews(field), Boolean(newsEditor)), button('newsReports', () => readNewsHistory(field)),
                field.id !== 'ai-technology' && button('newsRemove', () => { const input = { action: 'remove', id: field.id, expectedRevision: field.revision }; setConfirm({ kind: 'newsChange', input, last: closesNews(input) }); }, Boolean(newsEditor)))),
            h('p', { className: 'yj-clamp', title: field.focus }, field.focus),
            newsData.errors[field.id] && h('small', { className: 'yj-error', title: newsData.errors[field.id].message }, t('newsDiagnostics'), '：', newsData.errors[field.id].message),
            button('newsCurrent', () => readNewsReport(field.id, newsData.window.cutoff, field.name), false, { className: 'yj-card-start' }))),
            newsData.fields.length < newsData.limits.maxFields && h('button', { type: 'button', className: 'yj-card yj-add-card', disabled: Boolean(newsEditor), onClick: () => editNews(null) }, h('span', { className: 'yj-add-mark', 'aria-hidden': true }, '+'), h('h2', null, t('newsAdd')))),
          newsData.historyFields.length > 0 && h('details', { className: 'yj-section' }, h('summary', null, t('newsHistoryFields')), ...newsData.historyFields.map(field => h('div', { key: field.id, className: 'yj-row' }, h('span', null, field.name), field.deleted && h('small', null, t('newsDeletedField')), button('newsReports', () => readNewsHistory(field)))))),
        newsAbout && newsData && h(Modal, { title: t('newsSources'), onClose: () => setNewsAbout(false), className: 'yj-confirm' }, h('div', { className: 'yj-confirm-body' }, help('newsHelp'), help('newsStartHelp'), h('p', null, newsData.dependencies.model)), h('footer', { className: 'yj-dialog-actions' }, button('closePanel', () => setNewsAbout(false), false, { className: 'yj-primary' }))),
        newsSettings && newsEditor && h(Drawer, { title: t(newsData?.fields.some(field => field.id === newsEditor.id) ? 'newsEdit' : 'newsAdd'), busy, onClose: () => setConfirm({ kind: 'newsDraft' }),
          footer: [button('newsDiscard', () => setConfirm({ kind: 'newsDraft' }), false, { key: 'discard' }), newsData?.fields.some(field => field.id === newsEditor.id) && button('newsConflictReload', reloadNewsEditor, false, { key: 'reload' }), button('newsSave', saveNews, !newsEditor.field.name.trim() || !newsEditor.field.focus.trim() || !newsEditor.field.sources.length, { key: 'save', className: 'yj-primary' })] },
          h('fieldset', { className: 'yj-news-form', disabled: busy || confirm?.kind === 'newsChange' },
            field('newsName', newsEditor.field.name, value => patchNews('name', value)),
            h('label', { className: 'yj-field' }, t('newsFocus'), h('textarea', { value: newsEditor.field.focus, disabled: busy, onChange: event => patchNews('focus', event.target.value) })),
            h('label', { className: 'yj-choice' }, h('input', { type: 'checkbox', checked: newsEditor.field.enabled, disabled: busy, onChange: event => patchNews('enabled', event.target.checked) }), t('newsEnabled')),
            h('h3', null, t('newsSources')), help('newsSourceHelp'),
            ...choices.map(source => h('label', { key: source.url, className: 'yj-choice' }, h('input', { type: 'checkbox', checked: newsEditor.field.sources.some(item => item.url === source.url), disabled: busy || newsEditor.field.sources.length >= 10 && !newsEditor.field.sources.some(item => item.url === source.url), onChange: () => toggleSource(source) }), source.name, ' · ', source.url)),
            h('details', null, h('summary', null, t('newsSourceAdd')),
              field('newsSourceName', newsSource.name, value => setNewsSource(source => ({ ...source, name: value }))), field('newsSourceUrl', newsSource.url, value => setNewsSource(source => ({ ...source, url: value })), { type: 'url' }),
              ...[['kind', 'newsSourceKind', ['primary', 'newsPrimary'], ['media', 'newsMedia']], ['region', 'newsSourceRegion', ['domestic', 'newsDomestic'], ['overseas', 'newsOverseas']]].map(([key, label, ...options]) => h('label', { className: 'yj-field', key }, t(label), h('select', { value: newsSource[key], disabled: busy, onChange: event => setNewsSource(source => ({ ...source, [key]: event.target.value })) }, h('option', { value: '' }, t('newsSourceChoose')), ...options.map(([value, text]) => h('option', { value, key: value }, t(text)))))),
              button('newsSourceAdd', () => { patchNews('sources', [...newsEditor.field.sources, { ...newsSource }]); setNewsSource({ name: '', url: '', kind: '', region: '' }); }, !newsSource.name.trim() || !newsSource.url.trim() || !newsSource.kind || !newsSource.region || newsEditor.field.sources.length >= 10 || newsEditor.field.sources.some(source => source.url === newsSource.url))))),
        confirm?.kind === 'newsChange' && h(ConfirmDialog, { title: t(confirm.input.action === 'remove' ? 'newsRemoveTitle' : 'newsConfirm'), message: t(confirm.last ? 'newsLastHelp' : 'newsRemoveHelp'), confirmLabel: t('newsConfirm'), cancelLabel: t('cancel'), danger: confirm.input.action === 'remove', busy, onCancel: () => setConfirm(null), onConfirm: () => persistNews({ ...confirm.input, ...(confirm.last ? { confirmCancel: true } : {}) }) }),
        confirm?.kind === 'newsDraft' && h(ConfirmDialog, { title: t('newsDiscardTitle'), message: t('newsDiscardHelp'), confirmLabel: t('newsDiscard'), cancelLabel: t('cancel'), danger: true, busy, onCancel: () => setConfirm(null), onConfirm: () => { setNewsEditor(null); setConfirm(null); notify(t('draftDiscarded')); } }),
        newsHistory && h(Modal, { title: `${newsHistory.field.name} · ${t('newsReports')}`, onClose: () => setNewsHistory(null) }, newsHistory.field.deleted && help('newsDeletedField'),
          h('div', { className: 'yj-news-history' }, newsHistory.reports.length ? newsHistory.reports.map(report => h('button', { type: 'button', key: report.cutoff, disabled: busy, onClick: () => readNewsReport(report.fieldId, report.cutoff, report.fieldName) }, beijing(report.cutoff))) : help('newsHistoryEmpty')),
          newsHistory.nextBefore && button('newsHistoryOlder', () => readNewsHistory(newsHistory.field, newsHistory.nextBefore))),
        newsReport && h(Modal, { title: t('newsReports'), onClose: () => setNewsReport(null) }, newsReport.report ? reportView(newsReport.report) : help('newsReportEmpty')),
        newsItem && newsItemView(newsItem), newsRun && newsRunView(newsRun));


    return active ? body : null;
  };
}

export const name = 'whalewing-cards';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'cards', createView, { contract: newsContract, namespace: 'whalewingCards', entries: (scope, kit, api) => scope.effect(api.connectSchedule) }); }
