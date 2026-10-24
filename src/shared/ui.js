'use strict';

/* =========================================================================
 * SnapAsk — 共享 UI（内容脚本浮层 + 独立 viewer 页面）
 * ========================================================================= */

(() => {
  const ICONS = {
    send:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>',
    stop:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.54a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></svg>',
    min:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    copy:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    expand:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7Z"/><path d="M19 15c.2 2.2 1.1 3.1 3.3 3.3-2.2.2-3.1 1.1-3.3 3.3-.2-2.2-1.1-3.1-3.3-3.3 2.2-.2 3.1-1.1 3.3-3.3Z" opacity=".65"/></svg>',
    retry:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    key:
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l3 3"/></svg>'
  };

  const DEFAULTS = {
    autoAsk: true,
    autoCollapse: false,
    defaultQuestion: '请解释这张截图的内容。如果有报错、题目、表格或关键信息，请指出重点，并告诉我下一步该怎么做。',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 1500,
    systemPrompt: ''
  };

  const SOURCE_LABEL = {
    clipboard: '自动检测 · 剪贴板截图',
    shortcut: '快捷键截图',
    region: '框选截图',
    viewer: '独立窗口'
  };

  const QUICK_PROMPTS = [
    '解释这张截图',
    '提取其中的文字',
    '翻译成中文',
    '找出其中的问题或错误',
    '总结要点'
  ];

  const STYLE = `
  .sa-root, .sa-root * { box-sizing: border-box; }
  .sa-root {
    --bg: #ffffff;
    --bg-soft: #f7f8fb;
    --bg-code: #eef1f6;
    --text: #0f172a;
    --muted: #64748b;
    --line: rgba(15, 23, 42, .10);
    --line-strong: rgba(15, 23, 42, .16);
    --accent: #4f46e5;
    --accent2: #8b5cf6;
    --accent-soft: rgba(79, 70, 229, .09);
    --danger: #dc2626;
    --danger-soft: rgba(220, 38, 38, .08);
    --shadow: 0 30px 80px -22px rgba(15, 23, 42, .45), 0 2px 10px rgba(15, 23, 42, .10);
    position: relative;
    width: 100%;
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.55;
    text-align: left;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    .sa-root {
      --bg: #17171b;
      --bg-soft: #202027;
      --bg-code: #26262f;
      --text: #f1f5f9;
      --muted: #9aa4b2;
      --line: rgba(255, 255, 255, .10);
      --line-strong: rgba(255, 255, 255, .18);
      --accent-soft: rgba(129, 140, 248, .14);
      --danger-soft: rgba(248, 113, 113, .10);
      --shadow: 0 30px 80px -20px rgba(0, 0, 0, .7), 0 2px 10px rgba(0, 0, 0, .35);
    }
  }
  .sa-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: min(78vh, 720px);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 18px;
    box-shadow: var(--shadow);
    overflow: hidden;
    animation: sa-in .16s ease-out;
  }
  @keyframes sa-in { from { opacity: 0; transform: translateY(8px) scale(.985); } }
  .sa-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 10px 10px 12px;
    border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, var(--bg-soft), var(--bg));
    user-select: none;
    flex: 0 0 auto;
  }
  .sa-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .sa-logo {
    width: 26px; height: 26px; border-radius: 8px; flex: 0 0 auto;
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    box-shadow: 0 4px 12px -4px rgba(79, 70, 229, .6);
  }
  .sa-logo svg { width: 16px; height: 16px; }
  .sa-title { font-size: 13.5px; font-weight: 650; letter-spacing: .01em; white-space: nowrap; }
  .sa-sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sa-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
  .sa-icon-btn {
    width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; color: var(--muted); cursor: pointer;
    transition: background .15s, color .15s;
  }
  .sa-icon-btn:hover { background: var(--accent-soft); color: var(--text); }
  .sa-body { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
  .sa-shot {
    position: relative; flex: 0 0 auto; margin: 10px 12px 0;
    border-radius: 12px; overflow: hidden; border: 1px solid var(--line);
    background: var(--bg-soft);
  }
  .sa-shot img { display: block; width: 100%; max-height: 168px; object-fit: contain; cursor: zoom-in; }
  .sa-shot-tools { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; }
  .sa-source {
    position: absolute; left: 6px; bottom: 6px;
    padding: 2px 7px; border-radius: 999px;
    font-size: 10.5px; font-weight: 600; letter-spacing: .02em;
    color: #fff; background: rgba(15, 23, 42, .62);
    backdrop-filter: blur(6px);
  }
  .sa-chip-btn {
    display: inline-flex; align-items: center; gap: 4px;
    height: 24px; padding: 0 8px; border-radius: 7px;
    border: 1px solid var(--line); background: rgba(255, 255, 255, .08);
    color: var(--text); font-size: 11.5px; cursor: pointer;
    backdrop-filter: blur(6px);
  }
  .sa-chip-btn:hover { background: var(--accent-soft); }
  .sa-chips {
    display: flex; gap: 6px; padding: 9px 12px 0; overflow-x: auto;
    scrollbar-width: none; flex: 0 0 auto;
  }
  .sa-chips::-webkit-scrollbar { display: none; }
  .sa-chip {
    flex: 0 0 auto; height: 26px; padding: 0 10px;
    border: 1px solid var(--line); border-radius: 999px;
    background: var(--bg-soft); color: var(--text);
    font-size: 11.5px; cursor: pointer; white-space: nowrap;
    transition: background .15s, border-color .15s;
  }
  .sa-chip:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--line-strong); }
  .sa-chip:disabled { opacity: .45; cursor: not-allowed; }
  .sa-chat {
    flex: 1 1 auto; min-height: 90px; overflow-y: auto;
    padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 12px;
    scrollbar-width: thin;
  }
  .sa-chat::-webkit-scrollbar { width: 8px; }
  .sa-chat::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 8px; }
  .sa-turn { display: flex; flex-direction: column; gap: 7px; }
  .sa-user-row { align-self: flex-end; max-width: 90%; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .sa-tag { font-size: 10px; color: var(--muted); padding-right: 2px; }
  .sa-msg-user {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: #fff; padding: 8px 12px; border-radius: 14px 14px 4px 14px;
    white-space: pre-wrap; word-break: break-word;
    box-shadow: 0 6px 18px -8px rgba(79, 70, 229, .65);
  }
  .sa-msg-ai {
    position: relative; align-self: stretch;
    background: var(--bg-soft); border: 1px solid var(--line);
    border-radius: 14px 14px 14px 4px; padding: 10px 12px;
    word-break: break-word;
  }
  .sa-msg-ai.sa-error-card { background: var(--danger-soft); border-color: rgba(220, 38, 38, .22); }
  .sa-ai-tools { position: absolute; top: 6px; right: 6px; opacity: 0; transition: opacity .15s; }
  .sa-msg-ai:hover .sa-ai-tools { opacity: 1; }
  .sa-md { font-size: 13.5px; line-height: 1.62; }
  .sa-md > :first-child { margin-top: 0; }
  .sa-md > :last-child { margin-bottom: 0; }
  .sa-md p { margin: 0 0 8px; }
  .sa-md h2, .sa-md h3, .sa-md h4, .sa-md h5 { margin: 12px 0 6px; line-height: 1.35; font-weight: 650; }
  .sa-md h2 { font-size: 16px; }
  .sa-md h3 { font-size: 15px; }
  .sa-md h4, .sa-md h5 { font-size: 14px; }
  .sa-md ul, .sa-md ol { margin: 4px 0 8px; padding-left: 20px; }
  .sa-md li { margin: 2px 0; }
  .sa-md code {
    background: var(--bg-code); border: 1px solid var(--line);
    border-radius: 5px; padding: 1px 4px; font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .sa-md pre {
    background: var(--bg-code); border: 1px solid var(--line);
    border-radius: 9px; padding: 10px 12px; overflow-x: auto; margin: 8px 0;
  }
  .sa-md pre code { background: none; border: 0; padding: 0; font-size: 12px; line-height: 1.55; }
  .sa-md blockquote {
    margin: 6px 0; padding: 2px 0 2px 10px;
    border-left: 3px solid var(--line-strong); color: var(--muted);
  }
  .sa-md a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .sa-md hr { border: 0; border-top: 1px solid var(--line); margin: 10px 0; }
  .sa-empty {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 16px 14px; border: 1px dashed var(--line-strong); border-radius: 12px;
    text-align: center; color: var(--muted); font-size: 12.5px;
  }
  .sa-empty-icon {
    width: 38px; height: 38px; border-radius: 12px; display: flex;
    align-items: center; justify-content: center; color: var(--accent);
    background: var(--accent-soft); margin-bottom: 2px;
  }
  .sa-empty b { color: var(--text); font-size: 13.5px; }
  .sa-empty p { margin: 0 0 4px; }
  .sa-btn-primary {
    height: 30px; padding: 0 12px; border: 0; border-radius: 8px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer;
  }
  .sa-btn-primary:hover { filter: brightness(1.06); }
  .sa-btn-ghost {
    height: 28px; padding: 0 10px; border-radius: 8px;
    border: 1px solid var(--line-strong); background: var(--bg);
    color: var(--text); font-size: 12px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px;
  }
  .sa-btn-ghost:hover { background: var(--accent-soft); }
  .sa-error { display: flex; flex-direction: column; gap: 8px; }
  .sa-error-title { display: flex; align-items: center; gap: 6px; color: var(--danger); font-weight: 650; font-size: 13px; }
  .sa-error-msg { font-size: 12.5px; color: var(--text); white-space: pre-wrap; word-break: break-word; }
  .sa-error-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .sa-error-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--danger); flex: 0 0 auto; }
  .sa-caret {
    display: inline-block; width: 6px; height: 14px; margin-left: 2px;
    vertical-align: -2px; border-radius: 2px; background: var(--accent);
    animation: sa-blink .9s steps(2, start) infinite;
  }
  @keyframes sa-blink { 50% { opacity: 0; } }
  .sa-typing { display: inline-flex; align-items: center; gap: 4px; height: 16px; }
  .sa-typing i {
    width: 5px; height: 5px; border-radius: 50%; background: var(--muted);
    animation: sa-bounce 1.2s infinite ease-in-out;
  }
  .sa-typing i:nth-child(2) { animation-delay: .15s; }
  .sa-typing i:nth-child(3) { animation-delay: .3s; }
  @keyframes sa-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }
  .sa-composer {
    flex: 0 0 auto; display: flex; align-items: flex-end; gap: 8px;
    padding: 10px 12px; border-top: 1px solid var(--line); background: var(--bg);
  }
  .sa-input {
    flex: 1 1 auto; resize: none; min-height: 36px; max-height: 96px;
    padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 10px;
    background: var(--bg-soft); color: var(--text); font: inherit; font-size: 13px;
    line-height: 1.45; outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .sa-input::placeholder { color: var(--muted); }
  .sa-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .sa-send {
    width: 36px; height: 36px; flex: 0 0 auto; border: 0; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: #fff; cursor: pointer; transition: filter .15s, transform .1s;
  }
  .sa-send:hover { filter: brightness(1.07); }
  .sa-send:active { transform: scale(.96); }
  .sa-send.sa-stop { background: var(--text); color: var(--bg); }
  .sa-foot {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
    gap: 8px; padding: 0 14px 9px; color: var(--muted); font-size: 10.5px;
  }
  .sa-foot .sa-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sa-kbd {
    display: inline-block; padding: 0 4px; border: 1px solid var(--line);
    border-radius: 4px; background: var(--bg-soft); font-size: 10px;
  }
  .sa-collapsed .sa-body, .sa-collapsed .sa-foot { display: none; }
  .sa-collapsed .sa-head { border-bottom: 0; }
  .sa-lightbox {
    position: fixed; inset: 0; z-index: 10;
    background: rgba(2, 6, 23, .84); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px; cursor: zoom-out;
  }
  .sa-lightbox img { max-width: 100%; max-height: 100%; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  .sa-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `;

  /* ------------------------------------------------------------------ */
  /* 小工具                                                              */
  /* ------------------------------------------------------------------ */

  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'disabled') node.disabled = !!value;
        else node.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function escapeHtml(input) {
    return String(input).replace(/[&<>"']/g, (ch) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function inlineFormat(text) {
    let s = text;
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label, url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  function renderMarkdown(source) {
    if (!source) return '';
    const codeBlocks = [];
    let text = String(source).replace(/\r\n/g, '\n');

    text = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
      const idx = codeBlocks.length;
      const label = String(lang || '').trim();
      codeBlocks.push(
        `<pre><code${label ? ` data-lang="${escapeHtml(label)}"` : ''}>${escapeHtml(
          code.replace(/\n$/, '')
        )}</code></pre>`
      );
      return `\u0000CODE${idx}\u0000`;
    });

    text = escapeHtml(text);
    const lines = text.split('\n');
    const out = [];
    let listType = null;

    const closeList = () => {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };

    for (const raw of lines) {
      const line = raw;
      if (!line.trim()) {
        closeList();
        continue;
      }
      if (/^\u0000CODE\d+\u0000$/.test(line)) {
        closeList();
        out.push(line);
        continue;
      }
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        closeList();
        const level = Math.min(5, heading[1].length + 1);
        out.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
        continue;
      }
      const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (bullet) {
        if (listType !== 'ul') {
          closeList();
          out.push('<ul>');
          listType = 'ul';
        }
        out.push(`<li>${inlineFormat(bullet[1])}</li>`);
        continue;
      }
      const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
      if (ordered) {
        if (listType !== 'ol') {
          closeList();
          out.push('<ol>');
          listType = 'ol';
        }
        out.push(`<li>${inlineFormat(ordered[2])}</li>`);
        continue;
      }
      const quote = /^\s*&gt;\s?(.*)$/.exec(line);
      if (quote) {
        closeList();
        out.push(`<blockquote>${inlineFormat(quote[1])}</blockquote>`);
        continue;
      }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
        continue;
      }
      closeList();
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
    closeList();

    return out
      .join('\n')
      .replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => codeBlocks[Number(idx)] || '');
  }

  function isLocalUrl(url = '') {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(url);
  }

  function adapterLabel(settings) {
    const url = String((settings && settings.baseUrl) || '');
    if (/:22217(?:\/|$)/.test(url)) return 'DeepSeek 网页版';
    if (/:5005(?:\/|$)/.test(url)) return 'ChatGPT 网页版';
    return settings && settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容';
  }

  function sanitizeBaseUrl(url = '') {
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

  function hasApi(settings) {
    if (!settings) return false;
    return !!(settings.hasApiKey || settings.apiKey || isLocalUrl(settings.baseUrl || ''));
  }

  async function readSettings() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SNAPASK_GET_SETTINGS' });
      if (res && res.ok && res.settings) return res.settings;
    } catch {
      /* fallthrough */
    }
    try {
      const { settings } = await chrome.storage.local.get('settings');
      const merged = { ...DEFAULTS, ...(settings || {}) };
      return {
        ...merged,
        apiKey: '',
        hasApiKey: !!merged.apiKey,
        baseUrl: sanitizeBaseUrl(merged.baseUrl),
        systemPrompt: ''
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function openOptions() {
    try {
      chrome.runtime.sendMessage({ type: 'SNAPASK_OPEN_OPTIONS' }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------------ */
  /* 主入口                                                              */
  /* ------------------------------------------------------------------ */

  function mount(options) {
    const {
      host,
      image,
      source = 'clipboard',
      autoAsk = true,
      question = '',
      draggable = false,
      onClose = null
    } = options || {};

    if (!host) throw new Error('SnapAskUI.mount: host is required');

    const root = document.createElement('div');
    root.className = 'sa-root';
    let styleEl = null;
    if (options.shadow !== false) {
      const shadow = host.attachShadow({ mode: 'closed' });
      styleEl = document.createElement('style');
      styleEl.textContent = STYLE;
      shadow.append(styleEl, root);
    } else {
      styleEl = document.createElement('style');
      styleEl.textContent = STYLE;
      host.append(styleEl, root);
    }

    const state = {
      image,
      source,
      settings: { ...DEFAULTS },
      history: [],
      asking: false,
      port: null,
      destroyed: false,
      autoAsk,
      question,
      lastQuestion: '',
      autoAsked: false
    };

    let renderRaf = 0;
    let currentStreamText = '';
    let currentStreamEl = null;
    let autoGrowHandler = null;

    /* ---------------- DOM ---------------- */

    const head = h(
      'div',
      { class: 'sa-head' },
      h(
        'div',
        { class: 'sa-brand' },
        h('span', { class: 'sa-logo', html: ICONS.spark }),
        h(
          'div',
          null,
          h('div', { class: 'sa-title', text: 'SnapAsk 截图问答' }),
          h('div', { class: 'sa-sub', text: SOURCE_LABEL[source] || '截图问答' })
        )
      ),
      h(
        'div',
        { class: 'sa-actions' },
        h('button', {
          class: 'sa-icon-btn',
          title: '设置',
          'aria-label': '设置',
          html: ICONS.gear,
          onclick: openOptions
        }),
        h('button', {
          class: 'sa-icon-btn',
          title: '最小化',
          'aria-label': '最小化',
          html: ICONS.min,
          onclick: () => toggleCollapse()
        }),
        h('button', {
          class: 'sa-icon-btn',
          title: '关闭 (Esc)',
          'aria-label': '关闭',
          html: ICONS.close,
          onclick: () => close()
        })
      )
    );

    const shotImg = h('img', {
      src: image,
      alt: '截图',
      onclick: () => openLightbox(image)
    });

    const shot = h(
      'div',
      { class: 'sa-shot' },
      shotImg,
      h(
        'div',
        { class: 'sa-shot-tools' },
        h('button', {
          class: 'sa-chip-btn',
          title: '查看大图',
          html: ICONS.expand,
          onclick: () => openLightbox(image)
        })
      ),
      h('span', { class: 'sa-source', text: SOURCE_LABEL[source] || '截图' })
    );

    const chips = h(
      'div',
      { class: 'sa-chips' },
      ...QUICK_PROMPTS.map((prompt) =>
        h('button', {
          class: 'sa-chip',
          text: prompt,
          onclick: () => ask(prompt)
        })
      )
    );

    const chat = h('div', { class: 'sa-chat' });

    const input = h('textarea', {
      class: 'sa-input',
      rows: '1',
      placeholder: '继续追问…（Enter 发送，Shift+Enter 换行）',
      'aria-label': '输入问题'
    });

    const send = h('button', {
      class: 'sa-send',
      title: '发送',
      html: ICONS.send
    });

    const composer = h('div', { class: 'sa-composer' }, input, send);

    const modelLabel = h('span', { class: 'sa-model', text: '读取设置…' });

    const foot = h(
      'div',
      { class: 'sa-foot' },
      modelLabel,
      h('span', null, h('span', { class: 'sa-kbd', text: 'Esc' }), ' 关闭')
    );

    const body = h('div', { class: 'sa-body' }, shot, chips, chat, composer);
    const panel = h('div', { class: 'sa-panel' }, head, body, foot);

    if (draggable) head.style.cursor = 'grab';

    root.append(panel);

    /* ---------------- 行为 ---------------- */

    const close = () => {
      if (state.destroyed) return;
      destroy();
      if (typeof onClose === 'function') onClose();
    };

    function toggleCollapse(force) {
      const next = typeof force === 'boolean' ? force : !panel.classList.contains('sa-collapsed');
      panel.classList.toggle('sa-collapsed', next);
      const btn = head.querySelectorAll('.sa-icon-btn')[1];
      if (btn) {
        btn.title = next ? '展开' : '最小化';
        btn.setAttribute('aria-label', next ? '展开' : '最小化');
      }
      if (!next) {
        requestAnimationFrame(() => {
          chat.scrollTop = chat.scrollHeight;
          input.focus({ preventScroll: true });
        });
      }
    }

    function openLightbox(src) {
      const box = h('div', { class: 'sa-lightbox' }, h('img', { src, alt: '截图预览' }));
      box.addEventListener('click', () => box.remove());
      root.append(box);
    }

    function updateSendButton() {
      if (state.asking) {
        send.innerHTML = ICONS.stop;
        send.title = '停止生成';
        send.classList.add('sa-stop');
      } else {
        send.innerHTML = ICONS.send;
        send.title = '发送';
        send.classList.remove('sa-stop');
      }
      chips.querySelectorAll('.sa-chip').forEach((c) => {
        c.disabled = state.asking;
      });
    }

    function autoGrow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    }

    function scrollChat(force) {
      const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
      if (force || nearBottom) chat.scrollTop = chat.scrollHeight;
    }

    function setModelLabel() {
      const s = state.settings;
      modelLabel.textContent = `${s.model || '未设置模型'} · ${adapterLabel(s)}`;
      modelLabel.title = s.model || '';
    }

    function addTurn(questionText, auto) {
      const userRow = h(
        'div',
        { class: 'sa-user-row' },
        auto ? h('span', { class: 'sa-tag', text: '自动提问' }) : null,
        h('div', { class: 'sa-msg-user', text: questionText })
      );
      const ai = h(
        'div',
        { class: 'sa-msg-ai' },
        h('div', { class: 'sa-md' }, h('span', { class: 'sa-typing' }, h('i'), h('i'), h('i')))
      );
      const turn = h('div', { class: 'sa-turn' }, userRow, ai);
      chat.append(turn);
      scrollChat(true);
      return { turn, ai };
    }

    function showSetupCard() {
      const existing = chat.querySelector('.sa-setup-card');
      if (existing) {
        existing.scrollIntoView({ block: 'nearest' });
        return;
      }
      const card = h(
        'div',
        { class: 'sa-empty sa-setup-card' },
        h('div', { class: 'sa-empty-icon', html: ICONS.key }),
        h('b', { text: '还没有配置 AI 接口' }),
        h('p', {
          text: '填写 API Key 后，截图会自动发给模型解答。支持 GPT、DeepSeek、GLM、Claude、Gemini、Ollama 等。'
        }),
        h('button', {
          class: 'sa-btn-primary',
          text: '打开设置',
          onclick: openOptions
        })
      );
      chat.append(card);
      scrollChat(true);
    }

    function clearSetupCard() {
      chat.querySelectorAll('.sa-setup-card').forEach((n) => n.remove());
    }

    function scheduleRender(el, text) {
      currentStreamEl = el;
      currentStreamText = text;
      if (renderRaf) return;
      renderRaf = requestAnimationFrame(() => {
        renderRaf = 0;
        if (!currentStreamEl) return;
        currentStreamEl.innerHTML = renderMarkdown(currentStreamText) + '<span class="sa-caret"></span>';
        scrollChat(false);
      });
    }

    function finalizeRender(el, text) {
      if (renderRaf) {
        cancelAnimationFrame(renderRaf);
        renderRaf = 0;
      }
      el.innerHTML = renderMarkdown(text);
      scrollChat(false);
    }

    function attachCopyButton(aiEl, text) {
      const tools = h(
        'div',
        { class: 'sa-ai-tools' },
        h('button', {
          class: 'sa-icon-btn',
          title: '复制回答',
          'aria-label': '复制回答',
          html: ICONS.copy,
          onclick: async () => {
            const ok = await copyText(text);
            const btn = tools.querySelector('button');
            if (btn) {
              btn.style.color = ok ? '#16a34a' : '#dc2626';
              setTimeout(() => {
                btn.style.color = '';
              }, 900);
            }
          }
        })
      );
      aiEl.append(tools);
    }

    function finishAsk() {
      state.asking = false;
      const port = state.port;
      state.port = null;
      if (port) {
        try {
          port.disconnect();
        } catch {
          /* ignore */
        }
      }
      currentStreamEl = null;
      updateSendButton();
    }

    function showError(turn, message, questionText) {
      const ai = turn.querySelector('.sa-msg-ai') || turn;
      ai.classList.add('sa-error-card');
      ai.innerHTML = '';
      const retry = h('button', {
        class: 'sa-btn-ghost',
        html: ICONS.retry + '<span>重试</span>',
        onclick: () => {
          turn.remove();
          if (state.history.length && state.history[state.history.length - 1].role === 'user') {
            state.history.pop();
          }
          ask(questionText);
        }
      });
      const settingsBtn = h('button', {
        class: 'sa-btn-ghost',
        text: '打开设置',
        onclick: openOptions
      });
      ai.append(
        h(
          'div',
          { class: 'sa-error' },
          h('div', { class: 'sa-error-title' }, h('span', { class: 'sa-error-dot' }), '请求失败'),
          h('div', { class: 'sa-error-msg', text: message || '未知错误' }),
          h('div', { class: 'sa-error-actions' }, retry, settingsBtn)
        )
      );
      scrollChat(true);
    }

    function maybeAutoCollapse() {
      if (!state.settings.autoCollapse) return;
      setTimeout(() => {
        if (!state.destroyed) toggleCollapse(true);
      }, 1600);
    }

    function ask(text, opts = {}) {
      const questionText = String(text || '').trim();
      if (!questionText) return;
      if (state.asking) return;

      if (!hasApi(state.settings)) {
        showSetupCard();
        input.focus({ preventScroll: true });
        return;
      }

      clearSetupCard();
      state.lastQuestion = questionText;
      state.history.push({ role: 'user', content: questionText });

      const { turn, ai } = addTurn(questionText, !!opts.auto);
      const bodyEl = ai.querySelector('.sa-md');
      let acc = '';
      let settled = false;

      state.asking = true;
      updateSendButton();
      input.focus({ preventScroll: true });

      let port;
      try {
        port = chrome.runtime.connect({ name: 'snapask-chat' });
      } catch (err) {
        state.history.pop();
        turn.remove();
        state.asking = false;
        updateSendButton();
        const fallback = addTurn(questionText, !!opts.auto);
        showError(fallback.turn, '扩展连接失败，请刷新页面后重试。', questionText);
        return;
      }
      state.port = port;

      const cleanup = () => {
        if (settled) return false;
        settled = true;
        return true;
      };

      port.onMessage.addListener((msg) => {
        if (!msg || state.destroyed) return;
        if (msg.type === 'delta') {
          acc += msg.text || '';
          scheduleRender(bodyEl, acc);
        } else if (msg.type === 'done') {
          if (!cleanup()) return;
          acc = msg.text || acc;
          finalizeRender(bodyEl, acc);
          attachCopyButton(ai, acc);
          state.history.push({ role: 'assistant', content: acc });
          finishAsk();
          maybeAutoCollapse();
        } else if (msg.type === 'error') {
          if (!cleanup()) return;
          state.history.pop();
          showError(turn, msg.message || '请求失败', questionText);
          finishAsk();
        } else if (msg.type === 'aborted') {
          if (!cleanup()) return;
          if (acc) {
            finalizeRender(bodyEl, acc);
            attachCopyButton(ai, acc);
            state.history.push({ role: 'assistant', content: acc });
          } else {
            state.history.pop();
            turn.remove();
          }
          finishAsk();
        }
      });

      port.onDisconnect.addListener(() => {
        if (!cleanup()) return;
        if (acc) {
          finalizeRender(bodyEl, acc);
          attachCopyButton(ai, acc);
          state.history.push({ role: 'assistant', content: acc });
        } else {
          state.history.pop();
          showError(turn, '连接中断，请重试。', questionText);
        }
        finishAsk();
      });

      try {
        port.postMessage({
          type: 'ask',
          image: state.image,
          messages: state.history.slice()
        });
      } catch (err) {
        if (!cleanup()) return;
        state.history.pop();
        showError(turn, '扩展连接失败，请刷新页面后重试。', questionText);
        finishAsk();
      }
    }

    function abortAsk() {
      if (!state.asking || !state.port) return;
      try {
        state.port.postMessage({ type: 'abort' });
      } catch {
        /* ignore */
      }
    }

    send.addEventListener('click', () => {
      if (state.asking) {
        abortAsk();
        return;
      }
      const value = input.value;
      if (!value.trim()) return;
      input.value = '';
      autoGrow();
      ask(value);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (state.asking) {
          abortAsk();
          return;
        }
        const value = input.value;
        if (!value.trim()) return;
        input.value = '';
        autoGrow();
        ask(value);
      }
    });

    autoGrowHandler = autoGrow;
    input.addEventListener('input', autoGrow);

    const onDocumentKeydown = (event) => {
      if (event.key !== 'Escape') return;
      const lightbox = root.querySelector('.sa-lightbox');
      if (lightbox) {
        lightbox.remove();
        return;
      }
      close();
    };
    document.addEventListener('keydown', onDocumentKeydown, true);

    const onStorageChanged = (changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      const incoming = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
      state.settings = {
        ...incoming,
        apiKey: '',
        hasApiKey: !!incoming.apiKey,
        baseUrl: sanitizeBaseUrl(incoming.baseUrl),
        systemPrompt: ''
      };
      setModelLabel();
      if (hasApi(state.settings)) clearSetupCard();
    };
    try {
      chrome.storage.onChanged.addListener(onStorageChanged);
    } catch {
      /* ignore */
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      if (renderRaf) cancelAnimationFrame(renderRaf);
      if (state.port) {
        try {
          state.port.disconnect();
        } catch {
          /* ignore */
        }
      }
      document.removeEventListener('keydown', onDocumentKeydown, true);
      try {
        chrome.storage.onChanged.removeListener(onStorageChanged);
      } catch {
        /* ignore */
      }
      root.remove();
      if (styleEl && options.shadow === false && styleEl.parentNode) styleEl.remove();
    }

    /* ---------------- 初始化 ---------------- */

    // 第一帧先显示，避免等待设置造成空白。
    updateSendButton();

    readSettings().then((settings) => {
      if (state.destroyed) return;
      state.settings = settings;
      setModelLabel();

      if (!hasApi(settings)) {
        showSetupCard();
        if (autoAsk) {
          input.focus({ preventScroll: true });
        }
        return;
      }

      if (autoAsk && !state.autoAsked) {
        state.autoAsked = true;
        const q = String(question || settings.defaultQuestion || '').trim();
        if (q) ask(q, { auto: true });
      } else {
        input.focus({ preventScroll: true });
      }
    });

    return {
      root,
      panel,
      head,
      destroy,
      close,
      ask,
      abort: abortAsk,
      get state() {
        return state;
      }
    };
  }

  globalThis.SnapAskUI = {
    mount,
    renderMarkdown,
    version: '1.0.0'
  };
})();
