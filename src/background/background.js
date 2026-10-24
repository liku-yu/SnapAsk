'use strict';

/* =========================================================================
 * SnapAsk 截图问答 — background service worker
 * -------------------------------------------------------------------------
 * 职责：
 *  1. 管理设置、快捷键、右键菜单
 *  2. 在需要时创建 / 关闭 offscreen 剪贴板监听器
 *  3. 截取可见标签页、注入面板、处理框选截图
 *  4. 以流式方式调用 OpenAI 兼容 / Anthropic API
 * ========================================================================= */

const DEFAULTS = {
  enabled: true,
  autoDetect: true,
  autoAsk: true,
  autoCollapse: false,
  defaultQuestion: '请解释这张截图的内容。如果有报错、题目、表格或关键信息，请指出重点，并告诉我下一步该怎么做。',
  provider: 'openai', // openai | anthropic
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  maxTokens: 1500,
  systemPrompt:
    '你是 SnapAsk 截图助手。你会收到用户截取的屏幕图片和问题。请直接、准确地回答，' +
    '优先指出截图中的关键信息、错误原因和可执行的下一步。使用简体中文回答（除非用户要求其他语言）。' +
    '如果截图信息不足，请明确说明需要什么补充信息。',
  watchInterval: 1000,
  minImageSize: 64
};

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
const CONTENT_FILES = ['src/shared/ui.js', 'src/content/content.js'];
const MAX_IMAGE_EDGE = 1800;

/* ------------------------------------------------------------------ */
/* 设置                                                                */
/* ------------------------------------------------------------------ */

async function getSettings() {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    return { ...DEFAULTS, ...(settings || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...(patch || {}) };
  await chrome.storage.local.set({ settings: next });
  return next;
}

/* ------------------------------------------------------------------ */
/* offscreen 剪贴板监听                                                 */
/* ------------------------------------------------------------------ */

let offscreenCreating = null;
let syncChain = Promise.resolve();

async function hasOffscreen() {
  try {
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      return contexts.length > 0;
    }
    const clients = await self.clients.matchAll();
    return clients.some((c) => c.url.endsWith('/' + OFFSCREEN_URL));
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['CLIPBOARD'],
        justification: '监听剪贴板中新的截图，以便自动弹出问答面板。'
      })
      .catch((err) => {
        // Chrome 109–115 没有 runtime.getContexts()，clients.matchAll() 可能
        // 看不到已存在的 offscreen 文档；此时 createDocument 会报“只能有一个”。
        const message = String((err && err.message) || err || '');
        if (/single offscreen|only one offscreen|already exists/i.test(message)) return;
        throw err;
      })
      .finally(() => {
        offscreenCreating = null;
      });
  }
  await offscreenCreating;
}

function syncOffscreen() {
  syncChain = syncChain
    .then(async () => {
      const s = await getSettings();
      if (s.enabled && s.autoDetect) {
        await ensureOffscreen();
        sendToOffscreen(s);
      } else {
        if (await hasOffscreen()) {
          await chrome.offscreen.closeDocument().catch(() => {});
        }
      }
    })
    .catch((err) => console.warn('[SnapAsk] syncOffscreen:', err));
  return syncChain;
}

function sendToOffscreen(settings) {
  chrome.runtime
    .sendMessage({
      type: 'SNAPASK_WATCH_CONFIG',
      interval: Math.max(400, Number(settings.watchInterval) || 1000),
      minSize: Math.max(16, Number(settings.minImageSize) || 64),
      enabled: !!(settings.enabled && settings.autoDetect)
    })
    .catch(() => {});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const s = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
  sendToOffscreen(s);
  syncOffscreen();
});

/* ------------------------------------------------------------------ */
/* 安装 / 启动                                                         */
/* ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(async (details) => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...DEFAULTS, ...(settings || {}) } });
  await createMenus();
  syncOffscreen();
  if (details && details.reason === 'install') {
    setTimeout(() => chrome.runtime.openOptionsPage().catch(() => {}), 700);
  }
});

chrome.runtime.onStartup.addListener(() => {
  syncOffscreen();
});

async function createMenus() {
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: 'snapask-visible',
      title: 'SnapAsk：截取当前页面并提问',
      contexts: ['page', 'image', 'selection', 'link']
    });
    chrome.contextMenus.create({
      id: 'snapask-region',
      title: 'SnapAsk：框选区域并提问',
      contexts: ['page', 'image', 'selection', 'link']
    });
  } catch (err) {
    console.warn('[SnapAsk] createMenus:', err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const s = await getSettings();
  if (!s.enabled) return;
  if (info.menuItemId === 'snapask-region') {
    await startRegion(tab);
  } else if (info.menuItemId === 'snapask-visible') {
    await captureAndShow(tab);
  }
});

/* ------------------------------------------------------------------ */
/* 快捷键                                                              */
/* ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener(async (command) => {
  const s = await getSettings();
  if (!s.enabled) return;
  if (command === 'capture-visible') {
    await captureAndShow();
  } else if (command === 'capture-region') {
    await startRegion();
  }
});

/* ------------------------------------------------------------------ */
/* 截图                                                                */
/* ------------------------------------------------------------------ */

let lastCaptureAt = 0;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRestrictedUrl(url = '') {
  return /^(chrome|edge|about|devtools|chrome-extension):/i.test(url) ||
    /^https:\/\/chromewebstore\.google\.com\//i.test(url) ||
    /^https:\/\/chrome\.google\.com\/webstore\//i.test(url);
}

async function captureVisible(windowId) {
  // Chrome 限制 captureVisibleTab 最多 2 次/秒，这里做串行节流。
  const wait = Math.max(0, 550 - (Date.now() - lastCaptureAt));
  if (wait) await sleep(wait);
  lastCaptureAt = Date.now();
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

async function pingContent(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: 'SNAPASK_PING' });
    return !!(res && res.ok);
  } catch {
    return false;
  }
}

async function ensureContent(tabId) {
  if (await pingContent(tabId)) return true;
  try {
    for (const file of CONTENT_FILES) {
      await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    }
    await sleep(60);
    return await pingContent(tabId);
  } catch (err) {
    console.warn('[SnapAsk] ensureContent:', err);
    return false;
  }
}

async function hidePanelForCapture(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SNAPASK_HIDE_FOR_CAPTURE' });
    await sleep(80);
  } catch {
    /* no panel / no content script */
  }
}

async function captureAndShow(tabArg) {
  const tab = tabArg && tabArg.id ? tabArg : await activeTab();
  if (!tab || !tab.id) return;
  if (isRestrictedUrl(tab.url)) {
    await flashBadge('×');
    return;
  }
  try {
    await hidePanelForCapture(tab.id);
    const shot = await captureVisible(tab.windowId);
    const s = await getSettings();
    await showOnTab(tab, shot, 'shortcut', {
      autoAsk: s.autoAsk,
      question: s.defaultQuestion
    });
  } catch (err) {
    console.warn('[SnapAsk] captureAndShow:', err);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SNAPASK_RESTORE' });
    } catch {
      /* ignore */
    }
    await flashBadge('×');
  }
}

async function startRegion(tabArg) {
  let tab = tabArg && tabArg.id ? tabArg : await activeTab();
  if (!tab || !tab.id) return;
  if (isRestrictedUrl(tab.url)) {
    await flashBadge('×');
    return;
  }
  if (!(await ensureContent(tab.id))) {
    await flashBadge('×');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SNAPASK_START_REGION' });
  } catch (err) {
    console.warn('[SnapAsk] startRegion:', err);
    await flashBadge('×');
  }
}

async function flashBadge(text) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }).catch(() => {}), 1800);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* 图片处理                                                            */
/* ------------------------------------------------------------------ */

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

async function compressImage(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    let out;
    try {
      out = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
    } catch {
      out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
    }
    return await blobToDataUrl(out);
  } catch (err) {
    console.warn('[SnapAsk] compressImage:', err);
    return dataUrl;
  }
}

/**
 * 在指定标签页弹出面板；如果页面不允许注入（chrome:// 等）则打开独立窗口。
 */
async function showOnTab(tab, image, source, opts = {}) {
  const compressed = await compressImage(image);
  const payload = {
    type: 'SNAPASK_SHOW',
    image: compressed,
    source,
    autoAsk: opts.autoAsk !== false,
    question: opts.question || ''
  };

  if (tab && tab.id && !isRestrictedUrl(tab.url)) {
    if (await ensureContent(tab.id)) {
      try {
        await chrome.tabs.sendMessage(tab.id, payload);
        return { ok: true, mode: 'panel' };
      } catch (err) {
        console.warn('[SnapAsk] showOnTab send:', err);
      }
    }
  }

  await openViewer(compressed, source, opts);
  return { ok: true, mode: 'viewer' };
}

async function openViewer(image, source, opts = {}) {
  await chrome.storage.session.set({
    snapaskPayload: {
      image,
      source,
      autoAsk: opts.autoAsk !== false,
      question: opts.question || ''
    }
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/viewer/viewer.html') });
}

/* ------------------------------------------------------------------ */
/* 剪贴板事件                                                          */
/* ------------------------------------------------------------------ */

let handlingClipboard = false;

async function handleClipboardImage(msg) {
  const s = await getSettings();
  if (!s.enabled || !s.autoDetect) return;
  if (handlingClipboard) return;
  if (!msg || !msg.dataUrl) return;

  // 二次去重，避免 service worker 重启后 offscreen 重复上报。
  const { lastClipboardHash, lastClipboardAt } = await chrome.storage.local.get([
    'lastClipboardHash',
    'lastClipboardAt'
  ]);
  if (msg.hash && msg.hash === lastClipboardHash && Date.now() - (lastClipboardAt || 0) < 2500) {
    return;
  }

  handlingClipboard = true;
  try {
    await chrome.storage.local.set({
      lastClipboardHash: msg.hash || '',
      lastClipboardAt: Date.now()
    });
    const tab = await activeTab();
    if (!tab) return;
    await showOnTab(tab, msg.dataUrl, 'clipboard', {
      autoAsk: s.autoAsk,
      question: s.defaultQuestion
    });
  } catch (err) {
    console.warn('[SnapAsk] handleClipboardImage:', err);
  } finally {
    handlingClipboard = false;
  }
}

/* ------------------------------------------------------------------ */
/* 网页账户登录                                                        */
/* ------------------------------------------------------------------ */

async function clearWebLoginPending(provider) {
  const { snapaskWebLogin } = await chrome.storage.local.get('snapaskWebLogin');
  if (!snapaskWebLogin || !snapaskWebLogin[provider]) return;
  await chrome.storage.local.set({
    snapaskWebLogin: { ...snapaskWebLogin, [provider]: 0 }
  });
}

async function openWebLogin(provider) {
  const isChatGPT = provider === 'chatgpt';
  const { snapaskWebLogin } = await chrome.storage.local.get('snapaskWebLogin');
  const next = { ...(snapaskWebLogin || {}), [provider]: { at: Date.now() } };
  await chrome.storage.local.set({ snapaskWebLogin: next });
  await chrome.tabs.create({
    url: isChatGPT ? 'https://chatgpt.com/' : 'https://chat.deepseek.com/sign_in'
  });
}

async function saveChatGPTSession(payload = {}) {
  const token = String(payload.accessToken || '').trim();
  if (token.length < 20) {
    throw apiError('BAD_SESSION', '没有抓到有效的 ChatGPT Token，请确认已登录 ChatGPT 后重试。');
  }
  const email = String(payload.email || '').trim() || 'ChatGPT 账户';
  const name = String(payload.name || '').trim();
  const expires = String(payload.expires || '').trim();

  const { webAccounts } = await chrome.storage.local.get('webAccounts');
  const current = webAccounts && typeof webAccounts === 'object' ? webAccounts : {};
  const list = Array.isArray(current.chatgpt) ? current.chatgpt.slice() : [];
  const existing = list.find((a) => a && (a.email === email || a.token === token));
  const id = existing && existing.id ? existing.id : (crypto.randomUUID ? crypto.randomUUID() : 'cg-' + Date.now());

  const account = {
    id,
    email,
    name,
    token,
    expires,
    addedAt: existing && existing.addedAt ? existing.addedAt : Date.now(),
    updatedAt: Date.now()
  };
  const nextAccounts = {
    ...current,
    chatgpt: [account, ...list.filter((a) => a && a.id !== id)],
    chatgptActiveId: id
  };

  await chrome.storage.local.set({ webAccounts: nextAccounts });
  await saveSettings({
    provider: 'openai',
    baseUrl: 'http://127.0.0.1:5005/v1',
    model: 'gpt-4o',
    apiKey: token
  });
  await clearWebLoginPending('chatgpt');
  return { id, email, name, expires };
}

async function captureDeepseekFromTab(tabId) {
  if (!tabId) return { ok: false, error: '无法确定标签页' };

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      let deviceId = '';
      try {
        if (window.SMSdk && typeof window.SMSdk.getDeviceId === 'function') {
          deviceId = String((await window.SMSdk.getDeviceId()) || '');
        }
      } catch {
        /* ignore */
      }

      let email = '';
      try {
        for (const key of Object.keys(localStorage)) {
          const value = localStorage.getItem(key) || '';
          const match = value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
          if (match) {
            email = match[0];
            break;
          }
        }
      } catch {
        /* ignore */
      }
      if (!email) {
        try {
          const match = (document.body.innerText || '').match(
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
          );
          if (match) email = match[0];
        } catch {
          /* ignore */
        }
      }
      return { deviceId, email };
    }
  });

  const data = (execution && execution.result) || {};
  const deviceId = String(data.deviceId || '').trim();
  const email = String(data.email || '').trim();

  if (deviceId || email) {
    const { snapaskDeepseekLogin } = await chrome.storage.session.get('snapaskDeepseekLogin');
    const prev = snapaskDeepseekLogin || {};
    await chrome.storage.session.set({
      snapaskDeepseekLogin: {
        deviceId: deviceId || prev.deviceId || '',
        email: email || prev.email || '',
        at: Date.now()
      }
    });
  }
  if (deviceId) await clearWebLoginPending('deepseek');
  return { ok: true, deviceId, email };
}

async function checkAdapter(overrides) {
  const settings = { ...(await getSettings()), ...(overrides || {}) };
  let base = String(settings.baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '');
  if (!base) throw apiError('NO_BASE_URL', '请先填写适配器地址。');

  const res = await fetch(base + '/models', { headers: headersFor(settings) });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw humanizeHttpError(res.status, detail, settings);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  const models = Array.isArray(json && json.data)
    ? json.data.map((m) => m && m.id).filter(Boolean).slice(0, 20)
    : [];
  return { ok: true, status: res.status, models };
}

/* ------------------------------------------------------------------ */
/* API 调用                                                            */
/* ------------------------------------------------------------------ */

function isLocalUrl(url = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(url);
}

function sanitizeUrlForUi(url = '') {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    }
    return String(url || '');
  } catch {
    return String(url || '');
  }
}

function normalizeEndpoint(settings) {
  let base = String(settings.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw apiError('NO_BASE_URL', '请先填写 API Base URL。');
  if (settings.provider === 'anthropic') {
    if (/\/messages$/i.test(base)) return base;
    return base + '/messages';
  }
  if (/\/chat\/completions$/i.test(base)) return base;
  return base + '/chat/completions';
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

function apiError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function buildRequestBody(settings, image, messages) {
  const sys = String(settings.systemPrompt || '').trim();
  const msgs = Array.isArray(messages) ? messages.filter((m) => m && m.content) : [];
  const withImage = msgs.map((m, i) => {
    if (i === 0 && m.role === 'user' && image) {
      if (settings.provider === 'anthropic') {
        const parsed = parseDataUrl(image);
        if (parsed) {
          return {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.data } },
              { type: 'text', text: String(m.content) }
            ]
          };
        }
      } else {
        return {
          role: 'user',
          content: [
            { type: 'text', text: String(m.content) },
            { type: 'image_url', image_url: { url: image } }
          ]
        };
      }
    }
    return { role: m.role, content: String(m.content) };
  });

  if (settings.provider === 'anthropic') {
    return {
      model: settings.model,
      max_tokens: Math.max(64, Number(settings.maxTokens) || 1500),
      temperature: Number(settings.temperature) || 0,
      stream: true,
      ...(sys ? { system: sys } : {}),
      messages: withImage
    };
  }

  return {
    model: settings.model,
    stream: true,
    temperature: Number(settings.temperature) || 0,
    max_tokens: Math.max(64, Number(settings.maxTokens) || 1500),
    messages: [
      ...(sys ? [{ role: 'system', content: sys }] : []),
      ...withImage
    ]
  };
}

function extractDelta(json, provider) {
  if (!json) return '';
  if (json.type === 'error' || json.error) {
    const msg =
      (json.error && (json.error.message || json.error.msg)) ||
      (typeof json.error === 'string' ? json.error : '') ||
      json.message ||
      'API 返回错误';
    throw apiError('API_ERROR', msg);
  }
  if (provider === 'anthropic') {
    if (json.type === 'content_block_delta') return json.delta && json.delta.text ? json.delta.text : '';
    if (json.type === 'message_delta' || json.type === 'message_start') return '';
    return '';
  }
  const choice = json.choices && json.choices[0];
  if (!choice) return '';
  const d = choice.delta;
  if (d) {
    if (typeof d.content === 'string') return d.content;
    if (Array.isArray(d.content)) {
      return d.content.map((p) => (typeof p === 'string' ? p : p && p.text) || '').join('');
    }
    return '';
  }
  const c = choice.message && choice.message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (p && p.text) || '').join('');
  return '';
}

function extractFullText(json, provider) {
  if (!json) return '';
  if (json.error) throw apiError('API_ERROR', json.error.message || 'API 返回错误');
  if (provider === 'anthropic') {
    return (json.content || []).map((b) => b.text || '').join('');
  }
  const c = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (p && p.text) || '').join('');
  return '';
}

function headersFor(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.provider === 'anthropic') {
    headers['x-api-key'] = settings.apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
    // Anthropic 默认禁止浏览器直连，这个头用于允许扩展直接调用。
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (settings.apiKey) {
    headers['Authorization'] = 'Bearer ' + settings.apiKey;
  }
  return headers;
}

function redactSecrets(input, settings) {
  let text = String(input == null ? '' : input);
  const key = settings && typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
  if (key.length >= 4) {
    text = text.split(key).join('[REDACTED]');
  }
  text = text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, 'sk-[REDACTED]')
    .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, 'AIza[REDACTED]')
    .replace(/\b(ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{6,}\b/g, '[REDACTED]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|secret|token|x-api-key)\s*[:=：]\s*["']?)[^"'\s,;}]{4,}/gi,
      '$1[REDACTED]'
    )
    .replace(/("?authorization"?\s*[:=：]\s*["']?)[^"'\n,}]{6,}/gi, '$1[REDACTED]');
  return text.slice(0, 600);
}

function humanizeHttpError(status, detail, settings) {
  let apiMsg = '';
  try {
    const j = JSON.parse(detail);
    apiMsg = j?.error?.message || j?.message || j?.error?.msg || '';
  } catch {
    apiMsg = String(detail || '').slice(0, 400);
  }
  apiMsg = redactSecrets(apiMsg, settings);
  const suffix = apiMsg ? `：${apiMsg}` : '';
  if (status === 401 || status === 403) {
    return apiError('HTTP_401', `API Key 无效或没有权限（HTTP ${status}）${suffix}`);
  }
  if (status === 404) {
    return apiError('HTTP_404', `接口地址或模型不存在（HTTP 404）${suffix}。请检查 Base URL 是否包含版本号，例如 /v1。`);
  }
  if (status === 429) {
    return apiError('HTTP_429', `请求过于频繁或额度不足（HTTP 429）${suffix}`);
  }
  if (status === 400) {
    return apiError('HTTP_400', `请求参数被拒绝（HTTP 400）${suffix}`);
  }
  return apiError('HTTP_' + status, `API 请求失败（HTTP ${status}）${suffix}`);
}

function humanizeException(err, settings) {
  if (!err) return apiError('UNKNOWN', '未知错误');
  if (err.code && String(err.code).startsWith('HTTP_')) {
    return apiError(err.code, redactSecrets(err.message, settings));
  }
  if (err.code === 'API_ERROR') {
    return apiError('API_ERROR', redactSecrets(err.message, settings));
  }
  if (err.code === 'NO_API_KEY' || err.code === 'NO_BASE_URL') return err;
  if (err.name === 'TimeoutError' || /timeout/i.test(err.message || '')) {
    return apiError('TIMEOUT', 'API 响应超时。请检查网络或稍后重试。');
  }
  if (err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(err.message || '')) {
    return apiError(
      'NETWORK',
      '无法连接 API（网络错误）。请检查 Base URL、网络/代理，以及该服务是否允许浏览器直连。'
    );
  }
  if (err.name === 'AbortError') return err;
  return apiError('UNKNOWN', redactSecrets(err.message || String(err), settings));
}

async function streamChat({ settings, image, messages, signal }, onDelta) {
  if (!settings.apiKey && !isLocalUrl(settings.baseUrl)) {
    throw apiError('NO_API_KEY', '还没有配置 API Key。请打开设置填写 API。');
  }
  if (!settings.model) throw apiError('NO_MODEL', '请先填写模型名称（model）。');

  const endpoint = normalizeEndpoint(settings);
  const body = buildRequestBody(settings, image, messages);

  const ctrl = new AbortController();
  let timedOut = false;
  let idleTimer = null;
  const armTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, 120000);
  };
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  armTimer();

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: headersFor(settings),
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(idleTimer);
    if (timedOut) throw apiError('TIMEOUT', 'API 连接超时。请检查网络或 Base URL。');
    if (err.name === 'AbortError' && signal && signal.aborted) throw err;
    throw humanizeException(err, settings);
  }

  if (!res.ok) {
    clearTimeout(idleTimer);
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw humanizeHttpError(res.status, detail, settings);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  try {
    if (!contentType.includes('text/event-stream')) {
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        if (text.trim()) {
          onDelta(text.trim());
          return;
        }
        throw apiError('BAD_RESPONSE', 'API 返回了无法识别的响应。');
      }
      const full = extractFullText(json, settings.provider);
      if (full) onDelta(full);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armTimer();
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = extractDelta(json, settings.provider);
        if (delta) onDelta(delta);
      }
    }
  } catch (err) {
    if (timedOut) throw apiError('TIMEOUT', 'API 响应超时。请检查网络或稍后重试。');
    if (err.name === 'AbortError' && signal && signal.aborted) throw err;
    throw humanizeException(err, settings);
  } finally {
    clearTimeout(idleTimer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function testApi(overrides) {
  const settings = { ...(await getSettings()), ...(overrides || {}) };
  if (!settings.apiKey && !isLocalUrl(settings.baseUrl)) {
    throw apiError('NO_API_KEY', '还没有填写 API Key。');
  }
  const started = Date.now();
  let text = '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    await streamChat(
      {
        settings,
        image: null,
        messages: [{ role: 'user', content: '请只回复两个字母：OK' }],
        signal: ctrl.signal
      },
      (d) => {
        text += d;
      }
    );
    return {
      ok: true,
      text: text.trim().slice(0, 200),
      model: settings.model,
      ms: Date.now() - started
    };
  } catch (err) {
    if (ctrl.signal.aborted) throw apiError('TIMEOUT', '连接超时（45 秒）。');
    throw humanizeException(err, settings);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* 流式聊天端口                                                        */
/* ------------------------------------------------------------------ */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'snapask-chat') return;

  let controller = null;
  let settings = null;

  const safePost = (msg) => {
    try {
      port.postMessage(msg);
    } catch {
      /* port closed */
    }
  };

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'abort') {
      if (controller) controller.abort();
      return;
    }

    if (msg.type !== 'ask') return;

    if (controller) controller.abort();
    controller = new AbortController();
    const myController = controller;

    (async () => {
      try {
        settings = await getSettings();
        let acc = '';
        await streamChat(
          {
            settings,
            image: msg.image || null,
            messages: msg.messages || [],
            signal: myController.signal
          },
          (delta) => {
            acc += delta;
            safePost({ type: 'delta', text: delta });
          }
        );
        safePost({ type: 'done', text: acc });
      } catch (err) {
        if (err && err.name === 'AbortError') {
          safePost({ type: 'aborted' });
          return;
        }
        const friendly = humanizeException(err, settings);
        safePost({
          type: 'error',
          code: friendly.code || 'UNKNOWN',
          message: friendly.message || '请求失败'
        });
      }
    })();
  });

  port.onDisconnect.addListener(() => {
    if (controller) controller.abort();
    controller = null;
    settings = null;
  });
});

/* ------------------------------------------------------------------ */
/* 消息路由                                                            */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  (async () => {
    switch (msg.type) {
      case 'SNAPASK_GET_SETTINGS': {
        const { watchStatus } = await chrome.storage.local.get('watchStatus');
        const full = await getSettings();
        // 内容脚本 / 弹窗 / 独立窗口只需要知道“有没有配置 Key”，
        // 不需要拿到 Key 本身。完整 Key 只保留在 background 与设置页。
        const safe = {
          ...full,
          apiKey: '',
          hasApiKey: !!full.apiKey,
          baseUrl: sanitizeUrlForUi(full.baseUrl),
          systemPrompt: ''
        };
        sendResponse({ ok: true, settings: safe, watchStatus: watchStatus || null });
        break;
      }

      case 'SNAPASK_OPEN_OPTIONS':
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        break;

      case 'SNAPASK_CAPTURE_VISIBLE': {
        const tab = await activeTab();
        if (!tab) {
          sendResponse({ ok: false, error: '没有活动标签页' });
          break;
        }
        await captureAndShow(tab);
        sendResponse({ ok: true });
        break;
      }

      case 'SNAPASK_START_REGION': {
        const tab = (sender && sender.tab) || (await activeTab());
        await startRegion(tab);
        sendResponse({ ok: true });
        break;
      }

      case 'SNAPASK_CAPTURE_FOR_CROP': {
        const tab = sender && sender.tab;
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: '无法确定标签页' });
          break;
        }
        const image = await captureVisible(tab.windowId);
        sendResponse({ ok: true, image });
        break;
      }

      case 'SNAPASK_TEST_API': {
        try {
          const result = await testApi(msg.settings);
          sendResponse(result);
        } catch (err) {
          const friendly = humanizeException(err, msg.settings);
          sendResponse({ ok: false, code: friendly.code, error: friendly.message });
        }
        break;
      }

      case 'SNAPASK_CLIPBOARD_IMAGE':
        handleClipboardImage(msg);
        sendResponse({ ok: true });
        break;

      case 'SNAPASK_OPEN_CHATGPT_LOGIN':
        await openWebLogin('chatgpt');
        sendResponse({ ok: true });
        break;

      case 'SNAPASK_OPEN_DEEPSEEK_LOGIN':
        await openWebLogin('deepseek');
        sendResponse({ ok: true });
        break;

      case 'SNAPASK_CHATGPT_SESSION': {
        const from = String((sender && sender.url) || '');
        if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(from)) {
          sendResponse({ ok: false, error: '不允许的来源' });
          break;
        }
        try {
          const account = await saveChatGPTSession(msg);
          sendResponse({ ok: true, account });
        } catch (err) {
          const friendly = humanizeException(err, { apiKey: msg.accessToken });
          sendResponse({ ok: false, error: friendly.message });
        }
        break;
      }

      case 'SNAPASK_CAPTURE_DEEPSEEK': {
        const from = String((sender && sender.url) || '');
        if (!/^https:\/\/chat\.deepseek\.com\//i.test(from)) {
          sendResponse({ ok: false, error: '不允许的来源' });
          break;
        }
        const tab = sender && sender.tab;
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: '无法确定标签页' });
          break;
        }
        try {
          const result = await captureDeepseekFromTab(tab.id);
          sendResponse(result);
        } catch (err) {
          sendResponse({ ok: false, error: err.message || String(err) });
        }
        break;
      }

      case 'SNAPASK_CHECK_ADAPTER': {
        try {
          const result = await checkAdapter(msg.settings);
          sendResponse(result);
        } catch (err) {
          const friendly = humanizeException(err, msg.settings);
          sendResponse({ ok: false, code: friendly.code, error: friendly.message });
        }
        break;
      }

      case 'SNAPASK_WATCH_READY': {
        const s = await getSettings();
        sendToOffscreen(s);
        sendResponse({ ok: true });
        break;
      }

      case 'SNAPASK_WATCH_STATUS': {
        const status = { ...(msg.status || {}), at: Date.now() };
        const { watchStatus } = await chrome.storage.local.get('watchStatus');
        const changed =
          !watchStatus ||
          !!watchStatus.ok !== !!status.ok ||
          (watchStatus.error || '') !== (status.error || '') ||
          !watchStatus.at ||
          Date.now() - watchStatus.at > 30000;
        if (changed) await chrome.storage.local.set({ watchStatus: status });
        sendResponse({ ok: true });
        break;
      }

      case 'SNAPASK_CLEAR_DATA': {
        await chrome.storage.local.remove([
          'lastClipboardHash',
          'lastClipboardAt',
          'watchStatus'
        ]);
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'unknown message: ' + msg.type });
    }
  })().catch((err) => {
    const safeMessage = redactSecrets(err && err.message ? err.message : String(err), msg.settings);
    console.warn('[SnapAsk] message handler:', msg.type, safeMessage);
    try {
      sendResponse({ ok: false, error: safeMessage });
    } catch {
      /* channel closed */
    }
  });

  return true;
});

/* Service worker 被唤醒（扩展重载 / 浏览器启动）时，确保监听状态正确。 */
syncOffscreen();
