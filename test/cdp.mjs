#!/usr/bin/env node
/* Tiny CDP eval helper: node test/cdp.mjs <type-or-url-substring> '<js>' */
import fs from 'node:fs';

const endpoint = process.env.CDP || 'http://127.0.0.1:43047';
const [, , selector, exprArg] = process.argv;

if (!selector || !exprArg) {
  console.error('usage: node test/cdp.mjs <type|url-substring> <expression|@file>');
  process.exit(1);
}

const expr = exprArg.startsWith('@') ? fs.readFileSync(exprArg.slice(1), 'utf8') : exprArg;

const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find((t) => t.type === selector || t.url.includes(selector));
if (!target) {
  console.error('target not found. available:');
  for (const t of targets) console.error(` - ${t.type} ${t.url}`);
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg);
  }
};

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Runtime.enable');
const res = await send('Runtime.evaluate', {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
  userGesture: true
});

console.log(JSON.stringify(res.result, null, 2));
ws.close();
