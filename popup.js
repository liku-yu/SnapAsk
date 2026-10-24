'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const enabled = $('enabled');
  const watchDot = $('watchDot');
  const watchStatus = $('watchStatus');
  const apiDot = $('apiDot');
  const apiStatus = $('apiStatus');

  let settings = null;
  let watch = null;

  function isLocalUrl(url = '') {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(url);
  }

  function adapterLabel(settings) {
    const url = String((settings && settings.baseUrl) || '');
    if (/:22217(?:\/|$)/.test(url)) return 'DeepSeek 网页版';
    if (/:5005(?:\/|$)/.test(url)) return 'ChatGPT 网页版';
    return settings && settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容';
  }

  function hasApi(s) {
    return !!(s && (s.hasApiKey || s.apiKey || isLocalUrl(s.baseUrl || '')));
  }

  function setPill(el, text, bad) {
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
  }

  function render() {
    if (!settings) return;
    enabled.checked = settings.enabled !== false;

    if (!settings.enabled) {
      watchDot.className = 'dot';
      setPill(watchStatus, '已关闭', false);
    } else if (!settings.autoDetect) {
      watchDot.className = 'dot';
      setPill(watchStatus, '已暂停', false);
    } else if (watch && watch.ok === false) {
      watchDot.className = 'dot bad';
      setPill(watchStatus, '读取失败', true);
      watchStatus.title = watch.error || '无法读取剪贴板';
    } else if (watch && watch.ok) {
      watchDot.className = 'dot good';
      setPill(watchStatus, '运行中', false);
      watchStatus.title = '正在监听新的截图';
    } else {
      watchDot.className = 'dot';
      setPill(watchStatus, '等待截图', false);
    }

    if (hasApi(settings)) {
      const label = adapterLabel(settings);
      const isWeb = label !== 'OpenAI 兼容' && label !== 'Anthropic';
      apiDot.className = 'dot good';
      setPill(apiStatus, isWeb ? label : settings.model || '已配置', false);
      apiStatus.title = `${settings.model || ''} · ${label}`;
    } else {
      apiDot.className = 'dot bad';
      setPill(apiStatus, '未配置 API', true);
      apiStatus.title = '点击下方“打开设置与 API 配置”';
    }
  }

  async function load() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SNAPASK_GET_SETTINGS' });
      if (res && res.ok) {
        settings = res.settings;
        watch = res.watchStatus;
      }
    } catch (err) {
      console.warn('[SnapAsk] popup load:', err);
    }
    if (!settings) {
      const stored = await chrome.storage.local.get('settings');
      const merged = {
        enabled: true,
        autoDetect: true,
        baseUrl: '',
        apiKey: '',
        model: '',
        ...(stored.settings || {})
      };
      settings = { ...merged, apiKey: '', hasApiKey: !!merged.apiKey };
    }
    render();
  }

  enabled.addEventListener('change', async () => {
    if (!settings) return;
    const nextEnabled = enabled.checked;
    // 弹窗里的 settings 是脱敏副本，不能整体写回，否则会清空 API Key。
    try {
      const { settings: stored } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(stored || {}), enabled: nextEnabled } });
    } catch (err) {
      console.warn('[SnapAsk] save enabled:', err);
    }
    settings = { ...settings, enabled: nextEnabled };
    render();
  });

  $('capture').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SNAPASK_CAPTURE_VISIBLE' });
    } catch (err) {
      console.warn('[SnapAsk] capture:', err);
    }
    window.close();
  });

  $('region').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'SNAPASK_START_REGION' });
    } catch (err) {
      console.warn('[SnapAsk] region:', err);
    }
    window.close();
  });

  $('options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  $('shortcuts').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(() => {});
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      const incoming = { ...settings, ...(changes.settings.newValue || {}) };
      settings = { ...incoming, apiKey: '', hasApiKey: !!incoming.apiKey };
      render();
    }
    if (changes.watchStatus) {
      watch = changes.watchStatus.newValue;
      render();
    }
  });

  load();
})();
