'use strict';

/* =========================================================================
 * SnapAsk — 网页账户登录助手
 * -------------------------------------------------------------------------
 * 只在 chatgpt.com / chat.openai.com / chat.deepseek.com 运行。
 *
 *  ChatGPT：登录后读取同源 /api/auth/session，把 accessToken 交给 background。
 *  DeepSeek：登录后请求 background 在页面主世界执行 SMSdk.getDeviceId()，
 *            并把 device_id / 邮箱（尽力提取）交给 background。
 *
 * 只在设置页发起“登录”后（localStorage 里的 pending 标记）才工作。
 * 不读取聊天内容，不注入聊天页面 UI。
 * ========================================================================= */

(() => {
  if (globalThis.__snapaskWebLoginInjected) return;
  globalThis.__snapaskWebLoginInjected = true;

  const host = location.hostname;
  const isChatGPT = host === 'chatgpt.com' || host === 'chat.openai.com';
  const isDeepSeek = host === 'chat.deepseek.com';
  if (!isChatGPT && !isDeepSeek) return;

  const provider = isChatGPT ? 'chatgpt' : 'deepseek';
  const PENDING_TTL = 10 * 60 * 1000;
  const POLL_MS = 2500;

  let timer = null;
  let stopped = false;

  async function pending() {
    try {
      const { snapaskWebLogin } = await chrome.storage.local.get('snapaskWebLogin');
      const entry = snapaskWebLogin && snapaskWebLogin[provider];
      return !!(entry && entry.at && Date.now() - entry.at < PENDING_TTL);
    } catch {
      return false;
    }
  }

  async function clearPending() {
    try {
      const { snapaskWebLogin } = await chrome.storage.local.get('snapaskWebLogin');
      if (!snapaskWebLogin || !snapaskWebLogin[provider]) return;
      const next = { ...snapaskWebLogin, [provider]: 0 };
      await chrome.storage.local.set({ snapaskWebLogin: next });
    } catch {
      /* ignore */
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  async function captureChatGPT() {
    try {
      const res = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!res.ok) return false;
      const session = await res.json();
      const token = session && session.accessToken;
      if (!token || typeof token !== 'string') return false;

      const reply = await chrome.runtime.sendMessage({
        type: 'SNAPASK_CHATGPT_SESSION',
        accessToken: token,
        email: (session.user && session.user.email) || '',
        name: (session.user && session.user.name) || '',
        expires: session.expires || ''
      });
      if (reply && reply.ok) {
        stopped = true;
        await clearPending();
        return true;
      }
    } catch {
      /* not logged in yet / network */
    }
    return false;
  }

  async function captureDeepSeek() {
    try {
      const reply = await chrome.runtime.sendMessage({ type: 'SNAPASK_CAPTURE_DEEPSEEK' });
      if (reply && reply.ok && reply.deviceId) {
        stopped = true;
        await clearPending();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function tick() {
    if (stopped) return;
    if (!(await pending())) {
      schedule(4000);
      return;
    }
    const done = isChatGPT ? await captureChatGPT() : await captureDeepSeek();
    if (!done) schedule(POLL_MS);
  }

  schedule(700);

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.snapaskWebLogin) return;
      const value = changes.snapaskWebLogin.newValue || {};
      if (value[provider]) {
        stopped = false;
        schedule(400);
      }
    });
  } catch {
    /* ignore */
  }
})();
