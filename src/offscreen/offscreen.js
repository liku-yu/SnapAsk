'use strict';

/* =========================================================================
 * SnapAsk — offscreen 剪贴板监听器
 * -------------------------------------------------------------------------
 * 只做一件事：轮询系统剪贴板，发现新的图片就上报给 background。
 * 不读取、不上传任何非图片内容。
 *
 * 读取方式：
 *   1. navigator.clipboard.read()（需要焦点，offscreen 中经常不可用）
 *   2. document.execCommand('paste') + paste 事件（扩展页面在拥有
 *      clipboardRead 权限时可以工作，这条是主路径）
 * ========================================================================= */

let config = {
  interval: 1000,
  minSize: 64,
  enabled: true
};

let timer = null;
let running = false;
let baselineDone = false;
let lastHash = '';
let clipboardApiCooldownUntil = 0;
let lastOkReportAt = 0;
let lastErrReportAt = 0;

const pasteEl = document.getElementById('pastebin');

/* ------------------------------------------------------------------ */
/* 与 background 通信                                                  */
/* ------------------------------------------------------------------ */

function notify(message) {
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    /* extension reloaded */
  }
}

function reportStatus(ok, error) {
  const now = Date.now();
  if (ok) {
    if (now - lastOkReportAt < 30000) return;
    lastOkReportAt = now;
    notify({ type: 'SNAPASK_WATCH_STATUS', status: { ok: true, error: '' } });
  } else {
    if (now - lastErrReportAt < 15000) return;
    lastErrReportAt = now;
    notify({ type: 'SNAPASK_WATCH_STATUS', status: { ok: false, error: String(error || '读取剪贴板失败') } });
  }
}

/* ------------------------------------------------------------------ */
/* 剪贴板读取                                                          */
/* ------------------------------------------------------------------ */

function fileFromPasteEvent() {
  return new Promise((resolve) => {
    let settled = false;
    let commandOk = false;

    const finish = (blob) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('paste', onPaste, true);
      resolve({ blob: blob || null, commandOk });
    };

    const onPaste = (event) => {
      let found = null;
      const data = event.clipboardData;
      if (data) {
        for (const item of data.items || []) {
          if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
            found = item.getAsFile();
            break;
          }
        }
        if (!found) {
          for (const file of data.files || []) {
            if (file.type && file.type.startsWith('image/')) {
              found = file;
              break;
            }
          }
        }
      }
      // 防止把图片真正插入到 contenteditable 里。
      event.preventDefault();
      // 延后一个宏任务，让 execCommand 的返回值先写入 commandOk。
      setTimeout(() => finish(found), 0);
    };

    document.addEventListener('paste', onPaste, true);

    try {
      pasteEl.innerHTML = '';
      pasteEl.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }

    let ok = false;
    try {
      ok = document.execCommand('paste');
    } catch {
      ok = false;
    }
    commandOk = ok;

    // execCommand 触发 paste 事件是同步的；给异步实现留一点时间。
    setTimeout(() => {
      try {
        pasteEl.innerHTML = '';
      } catch {
        /* ignore */
      }
      finish(null);
    }, ok ? 500 : 120);
  });
}

/**
 * @returns {Promise<{ok: boolean, blob?: Blob|null, error?: string}>}
 */
async function readClipboardImage() {
  const now = Date.now();

  // 方式一：标准 Clipboard API（offscreen 通常因无焦点而失败）
  if (now > clipboardApiCooldownUntil) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = (item.types || []).find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          return { ok: true, blob };
        }
      }
      return { ok: true, blob: null };
    } catch (err) {
      clipboardApiCooldownUntil = now + 60000;
      // 继续尝试 execCommand
      void err;
    }
  }

  // 方式二：execCommand('paste') + paste 事件
  try {
    const result = await fileFromPasteEvent();
    if (!result.commandOk && !result.blob) {
      return { ok: false, error: '浏览器拒绝了剪贴板读取（paste 命令不可用）' };
    }
    return { ok: true, blob: result.blob || null };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

async function sha256(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

async function imageSize(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    if (bitmap.close) bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* 轮询                                                                */
/* ------------------------------------------------------------------ */

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(run, typeof delay === 'number' ? delay : config.interval);
}

async function tick() {
  if (!config.enabled) return;

  const result = await readClipboardImage();
  if (!result.ok) {
    reportStatus(false, result.error);
    return;
  }
  reportStatus(true);

  const blob = result.blob || null;

  if (!blob) {
    // 剪贴板里是文字或空内容，重置，下次出现图片时重新触发。
    lastHash = '';
    baselineDone = true;
    return;
  }

  const hash = await sha256(blob);

  if (!baselineDone) {
    // 插件刚启动时，剪贴板里已有的旧图片只作为基线，不弹窗。
    baselineDone = true;
    lastHash = hash;
    return;
  }

  if (hash === lastHash) return;
  lastHash = hash;

  const size = await imageSize(blob);
  if (size.width && size.height && (size.width < config.minSize || size.height < config.minSize)) {
    return; // 忽略小图标、表情等
  }

  const dataUrl = await blobToDataUrl(blob);
  notify({
    type: 'SNAPASK_CLIPBOARD_IMAGE',
    dataUrl,
    hash,
    width: size.width,
    height: size.height
  });
}

async function run() {
  if (running) {
    schedule();
    return;
  }
  running = true;
  try {
    await tick();
  } catch (err) {
    console.warn('[SnapAsk] clipboard tick:', err);
    reportStatus(false, err && err.message);
  } finally {
    running = false;
    schedule();
  }
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'SNAPASK_WATCH_CONFIG') return;
  config.interval = Math.max(400, Number(msg.interval) || 1000);
  config.minSize = Math.max(16, Number(msg.minSize) || 64);
  config.enabled = msg.enabled !== false;
  if (!config.enabled) {
    clearTimeout(timer);
  } else {
    schedule(10);
  }
  try {
    sendResponse({ ok: true });
  } catch {
    /* ignore */
  }
});

notify({ type: 'SNAPASK_WATCH_READY' });
schedule(30);
