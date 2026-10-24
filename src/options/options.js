'use strict';

(() => {
  const $ = (id) => document.getElementById(id);

  const DEFAULTS = {
    enabled: true,
    autoDetect: true,
    autoAsk: true,
    autoCollapse: false,
    defaultQuestion:
      '请解释这张截图的内容。如果有报错、题目、表格或关键信息，请指出重点，并告诉我下一步该怎么做。',
    provider: 'openai',
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

  const PRESETS = {
    openai: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini'
    },
    deepseek: {
      provider: 'openai',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash'
    },
    gemini: {
      provider: 'openai',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.0-flash'
    },
    zhipu: {
      provider: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.5v'
    },
    ollama: {
      provider: 'openai',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5vl:7b'
    },
    anthropic: {
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3-5-sonnet-latest'
    },
    deepseekWeb: {
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:22217/v1',
      model: 'deepseek-default'
    },
    chatgptWeb: {
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:5005/v1',
      model: 'gpt-4o'
    },
  };

  const WEB_ADAPTERS = {
    deepseekWeb: {
      label: 'DeepSeek 网页版',
      port: 22217,
      repo: 'https://github.com/NIyueeE/ds-free-api'
    },
    chatgptWeb: {
      label: 'ChatGPT 网页版',
      port: 5005,
      repo: 'https://github.com/lanqian528/chat2api'
    },
  };

  const FIELD_IDS = [
    'enabled',
    'autoDetect',
    'autoAsk',
    'autoCollapse',
    'watchInterval',
    'minImageSize',
    'defaultQuestion',
    'provider',
    'baseUrl',
    'apiKey',
    'model',
    'temperature',
    'maxTokens',
    'systemPrompt'
  ];

  const saveState = $('saveState');
  const apiBadge = $('apiBadge');
  const watchState = $('watchState');
  const testResult = $('testResult');
  const presetSelect = $('preset');
  const baseUrlHelp = $('baseUrlHelp');
  const apiKeyHelp = $('apiKeyHelp');
  const webModeBadge = $('webModeBadge');

  let state = { ...DEFAULTS };
  let watch = null;
  let saveTimer = null;
  let testBusy = false;
  let webAccounts = { chatgpt: [], chatgptActiveId: '' };
  let webLoginPending = {};
  let deepseekLogin = null;

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function isLocalUrl(url = '') {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(url);
  }

  function hasApi(settings) {
    return !!(settings && (settings.apiKey || isLocalUrl(settings.baseUrl || '')));
  }

  function setSaveState(text, kind) {
    saveState.textContent = text;
    saveState.className = 'save-state' + (kind ? ' ' + kind : '');
  }

  function fill(settings) {
    $('enabled').checked = settings.enabled !== false;
    $('autoDetect').checked = settings.autoDetect !== false;
    $('autoAsk').checked = settings.autoAsk !== false;
    $('autoCollapse').checked = !!settings.autoCollapse;
    $('watchInterval').value = settings.watchInterval || 1000;
    $('minImageSize').value = settings.minImageSize || 64;
    $('defaultQuestion').value = settings.defaultQuestion || '';
    $('provider').value = settings.provider || 'openai';
    $('baseUrl').value = settings.baseUrl || '';
    $('apiKey').value = settings.apiKey || '';
    $('model').value = settings.model || '';
    $('temperature').value = typeof settings.temperature === 'number' ? settings.temperature : 0.2;
    $('maxTokens').value = settings.maxTokens || 1500;
    $('systemPrompt').value = settings.systemPrompt || '';
    presetSelect.value = detectPreset(settings);
    updateWebStatus();
    updateWatchState();
    renderWebPanels();
  }

  function collect() {
    return {
      enabled: $('enabled').checked,
      autoDetect: $('autoDetect').checked,
      autoAsk: $('autoAsk').checked,
      autoCollapse: $('autoCollapse').checked,
      watchInterval: Math.round(clamp($('watchInterval').value, 400, 5000, 1000)),
      minImageSize: Math.round(clamp($('minImageSize').value, 16, 512, 64)),
      defaultQuestion: $('defaultQuestion').value.trim(),
      provider: $('provider').value === 'anthropic' ? 'anthropic' : 'openai',
      baseUrl: $('baseUrl').value.trim(),
      apiKey: $('apiKey').value.trim(),
      model: $('model').value.trim(),
      temperature: clamp($('temperature').value, 0, 2, 0.2),
      maxTokens: Math.round(clamp($('maxTokens').value, 64, 32000, 1500)),
      systemPrompt: $('systemPrompt').value.trim()
    };
  }

  function detectWebAdapter(url = '') {
    const text = String(url || '');
    for (const [name, adapter] of Object.entries(WEB_ADAPTERS)) {
      if (new RegExp(`:${adapter.port}(?:/|$)`).test(text)) return name;
    }
    return '';
  }

  function detectPreset(settings) {
    for (const [name, preset] of Object.entries(PRESETS)) {
      if (
        preset.provider === (settings.provider || 'openai') &&
        preset.baseUrl === (settings.baseUrl || '') &&
        preset.model === (settings.model || '')
      ) {
        return name;
      }
    }
    return 'custom';
  }

  function updateProviderHelp() {
    const adapterName = detectWebAdapter($('baseUrl').value);
    if (adapterName) {
      const adapter = WEB_ADAPTERS[adapterName];
      baseUrlHelp.textContent = `本机适配器地址（默认 ${adapter.port} 端口）；请先启动 ${adapter.label} 适配器。`;
      apiKeyHelp.textContent = '填适配器自己的 Key/Token，不是官方 API Key；切换适配器后需要重新填写。';
      return;
    }
    const isAnthropic = $('provider').value === 'anthropic';
    baseUrlHelp.textContent = isAnthropic
      ? '填写到 /v1 为止；插件会自动补 /messages。需要允许浏览器直连的 Anthropic API。'
      : '填写服务商的 OpenAI 兼容 Base URL（如 /v1 或 https://api.deepseek.com）；插件会自动补 /chat/completions。';
    apiKeyHelp.textContent = '保存在本机浏览器中，只会发送到你填写的 Base URL。';
  }

  function updateWebStatus() {
    const adapterName = detectWebAdapter($('baseUrl').value);
    if (webModeBadge) {
      webModeBadge.textContent = adapterName ? WEB_ADAPTERS[adapterName].label : '未选择';
      webModeBadge.className = 'badge ' + (adapterName ? 'good' : '');
    }
    updateProviderHelp();
    updateApiBadge();
  }

  function updateApiBadge() {
    const s = collect();
    apiBadge.textContent = hasApi(s) ? '已配置' : '未配置';
    apiBadge.className = 'badge ' + (hasApi(s) ? 'good' : 'bad');
  }

  function updateWatchState() {
    if (!watchState) return;
    const s = { enabled: $('enabled').checked, autoDetect: $('autoDetect').checked };
    if (!s.enabled) {
      watchState.textContent = '已关闭';
      watchState.className = 'status';
    } else if (!s.autoDetect) {
      watchState.textContent = '已暂停';
      watchState.className = 'status';
    } else if (watch && watch.ok === false) {
      watchState.textContent = '读取失败：' + (watch.error || '无法读取剪贴板');
      watchState.className = 'status bad';
    } else if (watch && watch.ok) {
      watchState.textContent = '运行中';
      watchState.className = 'status good';
    } else {
      watchState.textContent = '等待截图';
      watchState.className = 'status';
    }
  }

  function scheduleSave() {
    updateWebStatus();
    updateWatchState();
    setSaveState('保存中…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 450);
  }

  async function save() {
    const settings = collect();
    try {
      await chrome.storage.local.set({ settings });
      state = settings;
      setSaveState('已保存', 'saved');
      setTimeout(() => {
        if (saveState.textContent === '已保存') setSaveState('已保存', 'saved');
      }, 1500);
    } catch (err) {
      console.warn('[SnapAsk] save:', err);
      setSaveState('保存失败', 'error');
    }
  }

  function applyPreset(name) {
    if (name === 'custom') return;
    const preset = PRESETS[name];
    if (!preset) return;
    $('provider').value = preset.provider;
    $('baseUrl').value = preset.baseUrl;
    $('model').value = preset.model;
    testResult.textContent = '';
    testResult.className = 'test-result';
    updateWebStatus();
    scheduleSave();
  }

  function loginPending(provider) {
    const entry = webLoginPending && webLoginPending[provider];
    return !!(entry && entry.at && Date.now() - entry.at < 10 * 60 * 1000);
  }

  function formatExpiry(value) {
    if (!value) return { text: '到期时间未知', expired: false };
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return { text: '到期时间未知', expired: false };
    if (time < Date.now()) return { text: '已过期，请重新登录', expired: true };
    return { text: '到期：' + new Date(time).toLocaleDateString('zh-CN'), expired: false };
  }

  function renderWebPanels() {
    const list = webAccounts && Array.isArray(webAccounts.chatgpt) ? webAccounts.chatgpt : [];
    const activeId = (webAccounts && webAccounts.chatgptActiveId) || (list[0] && list[0].id) || '';
    const active = list.find((a) => a.id === activeId);
    const expired = !!(active && active.expires && new Date(active.expires).getTime() < Date.now());
    const cgState = $('chatgptState');

    if (list.length) {
      cgState.textContent = expired ? 'Token 已过期' : '已登录';
      cgState.className = 'web-state ' + (expired ? 'bad' : 'on');
    } else if (loginPending('chatgpt')) {
      cgState.textContent = '等待登录…';
      cgState.className = 'web-state pending';
    } else {
      cgState.textContent = '未登录';
      cgState.className = 'web-state';
    }
    renderChatGPTAccounts(list, activeId);

    const dsState = $('deepseekState');
    if (deepseekLogin && deepseekLogin.deviceId) {
      dsState.textContent = 'device_id 已抓取';
      dsState.className = 'web-state on';
    } else if (deepseekLogin && deepseekLogin.email) {
      dsState.textContent = '已抓取邮箱';
      dsState.className = 'web-state pending';
    } else if (loginPending('deepseek')) {
      dsState.textContent = '等待登录…';
      dsState.className = 'web-state pending';
    } else {
      dsState.textContent = '未登录';
      dsState.className = 'web-state';
    }

    const captured = $('deepseekCaptured');
    if (deepseekLogin && (deepseekLogin.deviceId || deepseekLogin.email)) {
      captured.hidden = false;
      $('deepseekEmail').textContent = deepseekLogin.email || '—';
      $('deepseekDeviceId').textContent = deepseekLogin.deviceId || '—';
    } else {
      captured.hidden = true;
    }
  }

  function renderChatGPTAccounts(list, activeId) {
    const el = $('chatgptAccounts');
    el.textContent = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'web-empty';
      empty.textContent = '还没有账户，点击“登录 ChatGPT”。';
      el.append(empty);
      return;
    }
    for (const account of list) {
      const row = document.createElement('div');
      row.className = 'web-account' + (account.id === activeId ? ' active' : '');

      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'chatgptAccount';
      radio.checked = account.id === activeId;
      const email = document.createElement('b');
      email.textContent = account.email || 'ChatGPT 账户';
      label.append(radio, email);
      label.addEventListener('click', (event) => {
        event.preventDefault();
        selectChatGPTAccount(account.id);
      });

      const meta = document.createElement('span');
      meta.className = 'web-account-meta';
      const expiry = formatExpiry(account.expires);
      meta.textContent = expiry.text;
      if (expiry.expired) meta.classList.add('expired');

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'web-account-del';
      del.textContent = '删除';
      del.addEventListener('click', () => deleteChatGPTAccount(account.id));

      row.append(label, meta, del);
      el.append(row);
    }
  }

  async function selectChatGPTAccount(id) {
    const list = (webAccounts && webAccounts.chatgpt) || [];
    const account = list.find((a) => a.id === id);
    if (!account) return;
    clearTimeout(saveTimer);

    $('provider').value = 'openai';
    $('baseUrl').value = 'http://127.0.0.1:5005/v1';
    $('model').value = 'gpt-4o';
    $('apiKey').value = account.token;
    presetSelect.value = 'chatgptWeb';

    const nextAccounts = { ...webAccounts, chatgptActiveId: id };
    const settings = collect();
    webAccounts = nextAccounts;
    state = settings;
    await chrome.storage.local.set({ webAccounts: nextAccounts, settings });
    updateWebStatus();
    renderWebPanels();
    setSaveState('已切换账户', 'saved');
  }

  async function deleteChatGPTAccount(id) {
    clearTimeout(saveTimer);
    const list = ((webAccounts && webAccounts.chatgpt) || []).filter((a) => a.id !== id);
    let activeId = (webAccounts && webAccounts.chatgptActiveId) || (list[0] && list[0].id) || '';
    if (activeId === id) activeId = (list[0] && list[0].id) || '';
    const active = list.find((a) => a.id === activeId);

    $('apiKey').value = active ? active.token : '';
    if (!active) {
      $('provider').value = 'openai';
      $('baseUrl').value = 'http://127.0.0.1:5005/v1';
      $('model').value = 'gpt-4o';
      presetSelect.value = 'chatgptWeb';
    }

    const nextAccounts = { ...webAccounts, chatgpt: list, chatgptActiveId: activeId };
    const settings = collect();
    webAccounts = nextAccounts;
    state = settings;
    await chrome.storage.local.set({ webAccounts: nextAccounts, settings });
    updateWebStatus();
    renderWebPanels();
    setSaveState(active ? '已切换账户' : '已删除账户', 'saved');
  }

  async function openLogin(kind) {
    const isChatGPT = kind === 'chatgpt';
    webLoginPending = { ...webLoginPending, [kind]: { at: Date.now() } };
    renderWebPanels();
    try {
      await chrome.runtime.sendMessage({
        type: isChatGPT ? 'SNAPASK_OPEN_CHATGPT_LOGIN' : 'SNAPASK_OPEN_DEEPSEEK_LOGIN'
      });
    } catch (err) {
      console.warn('[SnapAsk] open login:', err);
    }
  }

  function openDeepseekAdmin() {
    chrome.tabs.create({ url: 'http://127.0.0.1:22217/admin' }).catch(() => {});
  }

  async function copyDeepseekDeviceId() {
    const value = deepseekLogin && deepseekLogin.deviceId;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const btn = $('deepseekCopy');
    const old = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => {
      btn.textContent = old;
    }, 1200);
  }

  async function checkAdapter(kind) {
    const isDeepSeek = kind === 'deepseek';
    const el = $(isDeepSeek ? 'deepseekCheckResult' : 'chatgptCheckResult');
    el.textContent = '检测中…';
    el.className = 'web-check';

    const list = (webAccounts && webAccounts.chatgpt) || [];
    const activeId = (webAccounts && webAccounts.chatgptActiveId) || (list[0] && list[0].id);
    const account = list.find((a) => a.id === activeId);
    const settings = {
      ...collect(),
      provider: 'openai',
      baseUrl: isDeepSeek ? 'http://127.0.0.1:22217/v1' : 'http://127.0.0.1:5005/v1',
      model: isDeepSeek ? 'deepseek-default' : 'gpt-4o',
      apiKey: isDeepSeek
        ? $('apiKey').value.trim()
        : account
          ? account.token
          : $('apiKey').value.trim()
    };

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'SNAPASK_CHECK_ADAPTER',
        settings
      });
      if (res && res.ok) {
        const count = Array.isArray(res.models) ? res.models.length : 0;
        el.textContent = '已连接' + (count ? ` · ${count} 个模型` : '');
        el.className = 'web-check ok';
      } else {
        el.textContent = '未连接：' + ((res && res.error) || '未知错误');
        el.className = 'web-check bad';
      }
    } catch (err) {
      el.textContent = '检测失败：' + (err.message || err);
      el.className = 'web-check bad';
    }
  }

  async function load() {
    // 设置页是受信任的扩展页面，直接读取完整设置（包括 API Key）。
    // 不要让 background 把 Key 通过消息返回，避免 Key 出现在更多上下文里。
    try {
      const stored = await chrome.storage.local.get([
        'settings',
        'watchStatus',
        'webAccounts',
        'snapaskWebLogin'
      ]);
      state = { ...DEFAULTS, ...(stored.settings || {}) };
      watch = stored.watchStatus || null;
      webAccounts = stored.webAccounts || { chatgpt: [], chatgptActiveId: '' };
      webLoginPending = stored.snapaskWebLogin || {};
    } catch (err) {
      console.warn('[SnapAsk] load:', err);
      state = { ...DEFAULTS };
      watch = null;
    }
    try {
      const session = await chrome.storage.session.get('snapaskDeepseekLogin');
      deepseekLogin = session.snapaskDeepseekLogin || null;
    } catch {
      deepseekLogin = null;
    }
    fill(state);
    setSaveState('已加载');
  }

  /* ------------------------------------------------------------------ */
  /* 事件                                                                */
  /* ------------------------------------------------------------------ */

  for (const id of FIELD_IDS) {
    const el = $(id);
    if (!el) continue;
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      if (id === 'provider' || id === 'baseUrl' || id === 'apiKey') updateWebStatus();
      if (id === 'enabled' || id === 'autoDetect') updateWatchState();
      scheduleSave();
    });
  }

  presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));

  $('chatgptLogin').addEventListener('click', () => openLogin('chatgpt'));
  $('chatgptRefresh').addEventListener('click', () => openLogin('chatgpt'));
  $('deepseekLogin').addEventListener('click', () => openLogin('deepseek'));
  $('deepseekUse').addEventListener('click', () => {
    presetSelect.value = 'deepseekWeb';
    applyPreset('deepseekWeb');
    $('apiKey').focus({ preventScroll: true });
  });
  $('deepseekAdmin').addEventListener('click', openDeepseekAdmin);
  $('deepseekCopy').addEventListener('click', copyDeepseekDeviceId);
  $('deepseekCheck').addEventListener('click', () => checkAdapter('deepseek'));
  $('chatgptCheck').addEventListener('click', () => checkAdapter('chatgpt'));

  $('toggleKey').addEventListener('click', () => {
    const input = $('apiKey');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('toggleKey').textContent = show ? '隐藏' : '显示';
  });

  $('testBtn').addEventListener('click', async () => {
    if (testBusy) return;
    testBusy = true;
    const btn = $('testBtn');
    btn.disabled = true;
    testResult.className = 'test-result busy';
    testResult.textContent = '正在连接…';
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'SNAPASK_TEST_API',
        settings: collect()
      });
      if (res && res.ok) {
        testResult.className = 'test-result ok';
        testResult.textContent = `连接成功 · ${res.model} · ${res.ms}ms${
          res.text ? ` · 返回：${res.text}` : ''
        }`;
      } else {
        testResult.className = 'test-result bad';
        testResult.textContent = (res && res.error) || '连接失败';
      }
    } catch (err) {
      testResult.className = 'test-result bad';
      testResult.textContent = '连接失败：' + (err.message || err);
    } finally {
      testBusy = false;
      btn.disabled = false;
    }
  });

  $('shortcutsBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(() => {});
  });

  $('clearBtn').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SNAPASK_CLEAR_DATA' });
      watch = null;
      updateWatchState();
      setSaveState('运行数据已清除', 'saved');
    } catch (err) {
      setSaveState('清除失败', 'error');
    }
  });

  $('resetBtn').addEventListener('click', async () => {
    const ok = window.confirm('确定恢复所有默认设置吗？API Key 也会被清除。');
    if (!ok) return;
    state = { ...DEFAULTS };
    fill(state);
    await save();
    testResult.textContent = '';
    testResult.className = 'test-result';
    presetSelect.value = 'custom';
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session') {
      if (changes.snapaskDeepseekLogin) {
        deepseekLogin = changes.snapaskDeepseekLogin.newValue || null;
        renderWebPanels();
      }
      return;
    }
    if (area !== 'local') return;

    if (changes.settings && changes.settings.newValue) {
      const next = { ...DEFAULTS, ...changes.settings.newValue };
      state = next;
      // background 抓到 ChatGPT Token 后会自动切到 chat2api，这里同步到表单。
      if (/:5005(?:\/|$)/.test(next.baseUrl || '') && next.apiKey) {
        $('provider').value = next.provider || 'openai';
        $('baseUrl').value = next.baseUrl;
        $('model').value = next.model || '';
        $('apiKey').value = next.apiKey;
        presetSelect.value = 'chatgptWeb';
      }
      updateWebStatus();
    }

    if (changes.webAccounts) {
      webAccounts = changes.webAccounts.newValue || { chatgpt: [], chatgptActiveId: '' };
      renderWebPanels();
    }

    if (changes.snapaskWebLogin) {
      webLoginPending = changes.snapaskWebLogin.newValue || {};
      renderWebPanels();
    }

    if (changes.watchStatus) {
      watch = changes.watchStatus.newValue;
      updateWatchState();
    }
  });

  load();
})();
