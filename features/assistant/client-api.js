
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createAssistantClient(bridge, t, directory) {
    const { failure, restoreSession, prepareSession } = bridge;
    const { loadExperts, selectExpert } = directory;
    let assistantContext = { sessionId: '', paths: [] };
    const contextListeners = new Set();
    const setAssistantContext = (sessionId, paths) => {
      if (assistantContext.sessionId === sessionId && JSON.stringify(assistantContext.paths) === JSON.stringify(paths)) return;
      assistantContext = { sessionId, paths: [...paths] };
      contextListeners.forEach(listener => listener());
    };
    let assistantId;
    let assistantReady = false;
    let assistantPromise;
    function ensureAssistant() {
      if (assistantReady) return restoreSession(assistantId).then(() => assistantId);
      if (assistantPromise) return assistantPromise;
      const fresh = !assistantId;
      assistantId ||= `whalewing-assistant-${globalThis.crypto.randomUUID()}`;
      assistantPromise = (async () => {
        const role = (await loadExperts()).experts.find(item => item.id === 'manager');
        if (!role) throw failure(t('assistantMissing'), 'role_missing');
        await prepareSession(assistantId, fresh, { agentPreset: 'standard' });
        await selectExpert(assistantId, 'manager');
        assistantReady = true;
        return assistantId;
      })().catch(error => { error.sessionId ??= assistantId; throw error; }).finally(() => { assistantPromise = undefined; });
      return assistantPromise;
    }
    const inputViews = new Map();
    const inputViewListeners = new Set();
    function mountAssistantInput(sessionId) {
      const token = {};
      inputViews.set(sessionId, token);
      for (const listener of inputViewListeners) listener();
      return () => { if (inputViews.get(sessionId) === token) inputViews.delete(sessionId); };
    }
    async function proposeDiscussion(reference, proposal, signal) {
      const waiting = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
      waiting.throwIfAborted();
      await new Promise((resolve, reject) => {
        const aborted = () => { cleanup(); reject(waiting.reason); };
        let ready = false;
        const check = () => { if (ready && inputViews.has(reference.sessionId)) { cleanup(); resolve(); } };
        const cleanup = () => { waiting.removeEventListener('abort', aborted); inputViewListeners.delete(check); };
        waiting.addEventListener('abort', aborted, { once: true });
        inputViewListeners.add(check);
        reference.ready.then(() => { ready = true; check(); }, error => { cleanup(); reject(error); });
      });
      waiting.throwIfAborted();
      const binding = bridge.inputBinding(reference);
      if (!binding) throw failure(t('draftUnavailable'), 'input_unavailable');
      const input = binding.hooks.input;
      const actions = binding.props.inputActions;
      if (binding.key !== reference.sessionId || !input || !actions) throw failure(t('draftUnavailable'), 'input_unavailable');
      const draft = input.getSnapshot();
      if (draft.draft.includes(proposal)) return;
      const span = actions.captureInsertion();
      waiting.throwIfAborted();
      // 折叠到当前选区末端，只插入提议，不重建正文或破坏已有资料 chip。
      if (!actions.insertText(draft.draft ? `\n\n${proposal}\n\n` : proposal, { ...span, start: span.end }) || !input.getSnapshot().draft.includes(proposal)) throw failure(t('draftUnavailable'), 'draft_insert_rejected');
    }

  return {
    ensureAssistant, proposeDiscussion, mountAssistantInput, setAssistantContext, assistantContext: () => assistantContext,
    subscribeContext: listener => { contextListeners.add(listener); return () => contextListeners.delete(listener); },
    experts: directory.experts, subscribeExperts: directory.subscribeExperts, open: bridge.open, retain: bridge.retain,
    insertReference: (id, span, paths) => {
      const reference = { source: 'whalewing-knowledge', ref: JSON.stringify(paths), label: t('citeLabel', { count: paths.length }), appearance: 'file', clipboardText: paths.join('\n') };
      const result = bridge.insertInputReference(id, { reference, span });
      if (!result.bound) throw failure(t('citeFailed'), 'session_unbound');
      if (!result.accepted) throw failure(t('citeFailed'), 'reference_rejected');
    },
  };
}
