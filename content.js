'use strict';

/* =========================================================================
 * SnapAsk — 内容脚本
 * -------------------------------------------------------------------------
 * 负责：
 *  1. 在页面中挂载 Shadow DOM 面板（与页面样式完全隔离）
 *  2. 截图前隐藏面板、截图后恢复
 *  3. 框选区域截图
 * ========================================================================= */

(() => {
  if (globalThis.__snapaskInjected) return;
  globalThis.__snapaskInjected = true;

  const HOST_ID = '__snapask_panel_host__';
  const REGION_ID = '__snapask_region_host__';

  let current = null; // { host, ui, hidden }
  let region = null; // { host, cleanup }

  // 仅存在于内容脚本的隔离世界，供调试/自动化测试使用。
  // 页面主世界无法访问 closed shadow root，也无法访问这个对象。
  globalThis.__snapaskDebug = {
    panelText: () => (current && current.ui && current.ui.root ? current.ui.root.textContent : ''),
    panelError: () => {
      const root = current && current.ui && current.ui.root;
      const el = root && root.querySelector('.sa-error-msg');
      return el ? el.textContent : '';
    },
    panelModel: () => {
      const root = current && current.ui && current.ui.root;
      const el = root && root.querySelector('.sa-model');
      return el ? el.textContent : '';
    },
    panelExists: () => !!current
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ------------------------------------------------------------------ */
  /* 面板                                                                */
  /* ------------------------------------------------------------------ */

  function removePanel() {
    if (current && current.host) {
      try {
        current.ui && current.ui.destroy();
      } catch {
        /* ignore */
      }
      current.host.remove();
    }
    current = null;
  }

  function showPanel(payload) {
    if (!globalThis.SnapAskUI) {
      console.warn('[SnapAsk] UI 未加载');
      return;
    }
    removePanel();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText =
      'position:fixed;right:18px;bottom:18px;z-index:2147483647;' +
      'width:400px;max-width:calc(100vw - 24px);';
    document.documentElement.appendChild(host);

    const ui = globalThis.SnapAskUI.mount({
      host,
      shadow: true,
      image: payload.image,
      source: payload.source || 'clipboard',
      autoAsk: payload.autoAsk !== false,
      question: payload.question || '',
      draggable: true,
      onClose: () => removePanel()
    });

    current = { host, ui, hidden: false };
    makeDraggable(host, ui.head);
  }

  function makeDraggable(host, head) {
    if (!head) return;
    head.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target && event.target.closest && event.target.closest('button')) return;
      const rect = host.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      head.style.cursor = 'grabbing';
      try {
        head.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (ev) => {
        const maxX = window.innerWidth - rect.width - 8;
        const maxY = window.innerHeight - 60;
        const x = Math.max(8, Math.min(maxX, ev.clientX - offsetX));
        const y = Math.max(8, Math.min(maxY, ev.clientY - offsetY));
        host.style.left = x + 'px';
        host.style.top = y + 'px';
        host.style.right = 'auto';
        host.style.bottom = 'auto';
      };

      const onUp = () => {
        head.style.cursor = 'grab';
        head.removeEventListener('pointermove', onMove);
        head.removeEventListener('pointerup', onUp);
        head.removeEventListener('pointercancel', onUp);
      };

      head.addEventListener('pointermove', onMove);
      head.addEventListener('pointerup', onUp);
      head.addEventListener('pointercancel', onUp);
    });
  }

  async function hideForCapture() {
    if (current && current.host && !current.hidden) {
      current.host.style.display = 'none';
      current.hidden = true;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await sleep(70);
  }

  function restoreAfterCapture() {
    if (current && current.host && current.hidden) {
      current.host.style.display = '';
      current.hidden = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 框选区域                                                            */
  /* ------------------------------------------------------------------ */

  function startRegion() {
    if (region) return;
    if (document.getElementById(REGION_ID)) return;

    const host = document.createElement('div');
    host.id = REGION_ID;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .overlay {
        position: fixed; inset: 0; background: rgba(2, 6, 23, .34);
        cursor: crosshair; user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .overlay.selecting { background: transparent; }
      .hint {
        position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
        display: flex; align-items: center; gap: 10px;
        padding: 8px 14px; border-radius: 999px;
        background: rgba(15, 23, 42, .86); color: #f8fafc;
        font-size: 13px; line-height: 1.4; white-space: nowrap;
        box-shadow: 0 12px 32px rgba(2, 6, 23, .4);
        backdrop-filter: blur(8px); pointer-events: none;
        z-index: 2;
      }
      .hint b { color: #a5b4fc; font-weight: 650; }
      .hint kbd {
        padding: 0 5px; border-radius: 4px; border: 1px solid rgba(255,255,255,.25);
        background: rgba(255,255,255,.1); font-size: 11px;
      }
      .sel {
        position: fixed; display: none; border: 1.5px solid #a5b4fc;
        background: rgba(165, 180, 252, .10);
        box-shadow: 0 0 0 9999px rgba(2, 6, 23, .45);
        pointer-events: none; border-radius: 2px;
        z-index: 1;
      }
      .sel.on { display: block; }
      .size {
        position: absolute; right: -1px; bottom: -25px;
        padding: 2px 7px; border-radius: 5px;
        background: #4f46e5; color: #fff; font-size: 11px; line-height: 1.4;
        white-space: nowrap;
      }
    `;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML =
      '<b>框选要提问的区域</b><span>拖拽鼠标选择</span><span><kbd>Esc</kbd> 取消</span>';

    const sel = document.createElement('div');
    sel.className = 'sel';
    const size = document.createElement('span');
    size.className = 'size';
    sel.append(size);

    overlay.append(hint, sel);
    shadow.append(style, overlay);
    document.documentElement.appendChild(host);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    const cleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.removeEventListener('pointerdown', onDown);
      overlay.removeEventListener('pointermove', onMove);
      overlay.removeEventListener('pointerup', onUp);
      overlay.removeEventListener('pointercancel', onCancel);
      host.remove();
      region = null;
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cleanup();
      }
    };

    const rectOf = (ev) => {
      const x = Math.min(startX, ev.clientX);
      const y = Math.min(startY, ev.clientY);
      const w = Math.abs(ev.clientX - startX);
      const h = Math.abs(ev.clientY - startY);
      return { x, y, w, h };
    };

    const paint = (rect) => {
      sel.style.left = rect.x + 'px';
      sel.style.top = rect.y + 'px';
      sel.style.width = rect.w + 'px';
      sel.style.height = rect.h + 'px';
      size.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
    };

    const onDown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      startX = event.clientX;
      startY = event.clientY;
      dragging = true;
      overlay.classList.add('selecting');
      sel.classList.add('on');
      paint({ x: startX, y: startY, w: 0, h: 0 });
      try {
        overlay.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (event) => {
      if (!dragging) return;
      paint(rectOf(event));
    };

    const onCancel = () => {
      dragging = false;
      cleanup();
    };

    const onUp = async (event) => {
      if (!dragging) return;
      dragging = false;
      const rect = rectOf(event);
      cleanup();

      if (rect.w < 8 || rect.h < 8) return;

      await sleep(120);
      try {
        const res = await chrome.runtime.sendMessage({ type: 'SNAPASK_CAPTURE_FOR_CROP' });
        if (!res || !res.ok || !res.image) throw new Error('截图失败');
        await cropAndShow(res.image, rect);
      } catch (err) {
        console.warn('[SnapAsk] region capture:', err);
      }
    };

    overlay.addEventListener('pointerdown', onDown);
    overlay.addEventListener('pointermove', onMove);
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKey, true);

    region = { host, cleanup };
  }

  async function cropAndShow(dataUrl, rect) {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    const scaleX = img.naturalWidth / Math.max(1, window.innerWidth);
    const scaleY = img.naturalHeight / Math.max(1, window.innerHeight);
    const sx = Math.max(0, Math.round(rect.x * scaleX));
    const sy = Math.max(0, Math.round(rect.y * scaleY));
    const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(rect.w * scaleX)));
    const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(rect.h * scaleY)));

    const maxEdge = 1800;
    const ratio = Math.min(1, maxEdge / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * ratio));
    const dh = Math.max(1, Math.round(sh * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

    let cropped;
    try {
      cropped = canvas.toDataURL('image/webp', 0.92);
    } catch {
      cropped = canvas.toDataURL('image/jpeg', 0.9);
    }

    let settings = {};
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SNAPASK_GET_SETTINGS' });
      if (res && res.ok && res.settings) settings = res.settings;
    } catch {
      /* ignore */
    }

    showPanel({
      image: cropped,
      source: 'region',
      autoAsk: settings.autoAsk !== false,
      question: settings.defaultQuestion || ''
    });
  }

  /* ------------------------------------------------------------------ */
  /* 消息                                                                */
  /* ------------------------------------------------------------------ */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'SNAPASK_PING':
        sendResponse({ ok: true });
        return;

      case 'SNAPASK_SHOW':
        showPanel(msg);
        sendResponse({ ok: true });
        return;

      case 'SNAPASK_HIDE_FOR_CAPTURE':
        hideForCapture().then(() => sendResponse({ ok: true }));
        return true;

      case 'SNAPASK_RESTORE':
        restoreAfterCapture();
        sendResponse({ ok: true });
        return;

      case 'SNAPASK_START_REGION':
        startRegion();
        sendResponse({ ok: true });
        return;

      case 'SNAPASK_CLOSE':
        removePanel();
        if (region) region.cleanup();
        sendResponse({ ok: true });
        return;

      default:
        return;
    }
  });
})();
