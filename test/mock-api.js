'use strict';

/* Minimal OpenAI-compatible / Anthropic mock server for SnapAsk e2e tests. */

const http = require('http');

const PORT = Number(process.env.PORT || 8787);

const ANSWER =
  '这是 **Example Domain** 的示例页面截图。\n\n' +
  '- 页面用途：文档示例、测试与演示\n' +
  '- 关键说明：该域名无需许可即可使用\n' +
  '- 操作建议：点击页面底部的 “Learn more” 查看更多信息\n\n' +
  '```text\nThis domain is for use in documentation examples\nwithout needing permission.\n```\n\n' +
  '如果你需要，我可以进一步解释页面中的某一段内容。';

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    console.log(`${req.method} ${req.url} (${body.length} bytes) auth=${!!req.headers.authorization} xkey=${!!req.headers['x-api-key']}`);

    if (req.url.startsWith('/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-vision' }, { id: 'gpt-4o' }, { id: 'deepseek-default' }] }));
      return;
    }

    if (req.url.startsWith('/v1/chat/completions')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });

      const chunks = ANSWER.match(/.{1,8}/gs) || [ANSWER];
      let i = 0;
      const timer = setInterval(() => {
        if (i >= chunks.length) {
          sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
          res.write('data: [DONE]\n\n');
          res.end();
          clearInterval(timer);
          return;
        }
        sse(res, { choices: [{ delta: { content: chunks[i++] } }] });
      }, 12);
      res.on('close', () => clearInterval(timer));
      return;
    }

    if (req.url.startsWith('/v1/messages')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      const chunks = ANSWER.match(/.{1,8}/gs) || [ANSWER];
      let i = 0;
      const timer = setInterval(() => {
        if (i >= chunks.length) {
          res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
          res.end();
          clearInterval(timer);
          return;
        }
        res.write(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: chunks[i++] }
          })}\n\n`
        );
      }, 12);
      res.on('close', () => clearInterval(timer));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock api listening on http://127.0.0.1:${PORT}`);
});
