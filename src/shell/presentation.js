/** 会话呈现与焦点是同一宿主资源，优先级只用于协调停靠区与内容页，不持有领域状态。 */
export function createPresentation(api) {
  const leases = new Map(), listeners = new Set();
  let snapshot = { reference: null, identity: null, error: '' }, release, focus;
  const restoreFocus = () => { focus?.release(); focus = null; };
  const update = () => {
    const winner = [...leases.values()].sort((a, b) => b.priority - a.priority)[0]?.reference || null;
    if (winner === snapshot.reference && !snapshot.error) return;
    restoreFocus(); release?.(); release = null;
    let error = '';
    try { if (winner) release = api.presentAssistant(winner.sessionId); } catch (reason) { error = reason.message; }
    snapshot = { reference: winner, identity: error ? null : winner?.sessionId || null, error };
    for (const listener of listeners) listener();
  };
  return {
    snapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    claim(key, reference, priority) { const lease = { reference, priority }; leases.set(key, lease); update(); return () => { if (leases.get(key) === lease) { leases.delete(key); update(); } }; },
    restoreFocus,
    focus() { const id = snapshot.identity; if (!id) throw new Error('浏览器还没准备好，请重试'); if (focus?.id === id) return; restoreFocus(); focus = { id, release: api.focusBrowser(id) }; },
    retry: update,
    clear() { leases.clear(); update(); },
    dispose() { leases.clear(); update(); listeners.clear(); },
  };
}
