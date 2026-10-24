'use strict';

(async () => {
  const app = document.getElementById('app');

  let payload = null;
  try {
    const stored = await chrome.storage.session.get('snapaskPayload');
    payload = stored && stored.snapaskPayload;
    if (payload) await chrome.storage.session.remove('snapaskPayload');
  } catch (err) {
    console.warn('[SnapAsk] viewer payload:', err);
  }

  if (!payload || !payload.image) {
    app.innerHTML =
      '<div style="padding:40px;text-align:center;font-size:14px;opacity:.7">没有可显示的截图。请重新截图。</div>';
    return;
  }

  globalThis.SnapAskUI.mount({
    host: app,
    shadow: false,
    image: payload.image,
    source: payload.source || 'viewer',
    autoAsk: payload.autoAsk !== false,
    question: payload.question || '',
    draggable: false,
    onClose: async () => {
      try {
        const tab = await chrome.tabs.getCurrent();
        if (tab && tab.id != null) {
          await chrome.tabs.remove(tab.id);
          return;
        }
      } catch {
        /* ignore */
      }
      window.close();
    }
  });
})();
