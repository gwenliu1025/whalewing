import { createAiWebView } from './view.js';
import { aiWebContract } from './contract.js';
import { registerFeature, useFeature } from '../../src/shell/feature.js';

/** AI 网页只持有自己的浏览器租约，助手和它通过中立呈现服务协调。 */
export function createView({ React, ActionMenu }) {
  const AiWebView = createAiWebView(React);
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  return function AiWebFeature({ active, workbench }) {
    const { api, t, notify, bind } = useFeature(React, workbench, 'ai-web');
    const presentation = workbench.internal.presentation;
    const presented = useSyncExternalStore(presentation.subscribe, presentation.snapshot, presentation.snapshot);
    const [browserReference, setBrowserReference] = useState(null);
    const browserOpening = useRef(null), browserRetained = useRef(null), mounted = useRef(true);
    const presentedIdentity = { get current() { return presentation.snapshot().identity; } };
    const presentedReference = presented.reference;
    const visibleAssistant = presented.reference !== browserReference ? presented.reference : null;
    const restoreBrowser = presentation.restoreFocus;
    const focusMountedBrowser = () => { if (!active) throw new Error(t('browserMissing')); presentation.focus(); };
    const releaseBrowserReference = () => { restoreBrowser(); const reference = browserRetained.current; browserRetained.current = null; reference?.release(); if (mounted.current) setBrowserReference(null); };
    useEffect(() => { const opening = browserOpening.current; const intendedId = presented.reference?.sessionId || null; if (opening && opening.expected !== intendedId) opening.controller.abort(new Error('浏览器会话已切换，请重新打开')); }, [presented.reference]);
    useEffect(() => browserReference && active ? presentation.claim('content', browserReference, 10) : undefined, [browserReference, active]);
    useEffect(() => { if (!active) { browserOpening.current?.controller.abort(new Error('已离开 AI 网页')); releaseBrowserReference(); } else if (visibleAssistant) releaseBrowserReference(); }, [active, visibleAssistant]);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; browserOpening.current?.controller.abort(new Error('工作台已关闭')); releaseBrowserReference(); }; }, []);
    const prepareAiBrowser = async (url, outerSignal, key) => {
      // 原生 DSH 没有把浏览器铺满工作台的接口：在专用的「AI 网页」会话里打开。
      if (!api.supportsInlinePresentation()) return api.openAiInConversation(url, key, outerSignal);
      if (!active || browserOpening.current) throw new Error('浏览器正在准备或页面已离开');
      api.browserAvailable();
      const controller = new AbortController(), ticket = { controller, expected: presentedReference?.sessionId || null };
      browserOpening.current = ticket;
      let acquired, timer;
      const forward = () => controller.abort(outerSignal.reason || new Error('打开已取消'));
      outerSignal?.addEventListener('abort', forward, { once: true });
      if (outerSignal?.aborted) forward();
      const deadline = setTimeout(() => controller.abort(new Error('浏览器准备超时，请保留原会话并重试')), 15000);
      const signal = controller.signal;
      const aborted = new Promise((_, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
      const wait = promise => Promise.race([promise, aborted]);
      try {
        let target = visibleAssistant || browserReference;
        if (!target) {
          const id = await wait(api.ensureWorkbench(signal));
          signal.throwIfAborted();
          acquired = api.retain(id);
          await wait(acquired.ready);
          signal.throwIfAborted();
          target = acquired;
          ticket.expected = id;
          browserRetained.current = acquired;
          setBrowserReference(acquired);
          acquired = null;
        } else ticket.expected = target.sessionId;
        // presentSession 只表达呈现意图；跨过 React commit 并确认实际 mounted 后才投递。
        do {
          await wait(new Promise(resolve => { timer = setTimeout(resolve, 16); }));
          signal.throwIfAborted();
          if (presentedIdentity.current && presentedIdentity.current !== target.sessionId) throw new Error('浏览器会话已切换，请重新打开');
        } while (presentedIdentity.current !== target.sessionId || api.browserMounted() !== target.sessionId);
        focusMountedBrowser();
        // 继续使用只恢复原浏览器呈现，不创建标签或重新导航已有网页。
        if (url !== undefined) await wait(api.openBrowser(url, target.sessionId, key));
        signal.throwIfAborted();
      } catch (reason) {
        releaseBrowserReference();
        throw reason;
      } finally {
        clearTimeout(deadline); clearTimeout(timer);
        outerSignal?.removeEventListener('abort', forward);
        acquired?.release();
        if (browserOpening.current === ticket) browserOpening.current = null;
      }
    };
    const openAiBrowser = (url, signal, key) => prepareAiBrowser(url, signal, key);
    const focusBrowser = signal => prepareAiBrowser(undefined, signal);
    return h(AiWebView, { key: 'aiWeb', active, sessionId: presentedReference?.sessionId, manageAiWeb: api.aiWebRequest, openBrowser: openAiBrowser, restoreBrowser, focusBrowser, notify, ActionMenu });
  };
}

export const name = 'whalewing-ai-web';
export const inject = ['slots', 'locale', 'remote', 'whalewingWorkbench'];
export function apply(ctx) { return registerFeature(ctx, 'ai-web', createView, { contract: aiWebContract, namespace: 'whalewingAiWeb', entries: (scope, kit) => scope.slots.inject('browser.toolbar.actions', () => scope.slots.register({ name: 'browser.toolbar.actions', id: 'whalewing-ai-picker', order: 10 }, createAiWebView(kit.React).Toolbar)) }); }
