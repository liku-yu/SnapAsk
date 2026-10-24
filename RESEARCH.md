# 调研记录

调研时间：2026-10。

## 一、目标

做一个浏览器扩展：**开启后，截图时自动弹出并解答问题**，并支持接入自己的 API。

关键难点是“自动感知截图”。浏览器无法监听系统截图键，可行方案是监听**剪贴板中的新图片**。

## 二、现成插件

| 插件 | 触发方式 | 自动感知 | 自动提问 | 自有 API | 结论 |
| --- | --- | --- | --- | --- | --- |
| ScreenAsk | `Ctrl/⌘+Shift+S` | ❌ | ❌ | ✅ | 最接近，但需手动按快捷键再提问 |
| Screenshot GPT | 图标 → 框选 | ❌ | ❌ | 未明确 | 纯手动 |
| SnipSolve AI | 手动截图/选中文字 | ❌ | ❌ | ✅ OpenAI Key | 偏作业题 |
| CropView | 截图/标注/发送 | ❌ | ❌ | ❌ | 强在编辑，不是自动问答 |
| Free Screenshot AI Ask Anything | 点 Capture tab | ❌ | ❌ | ❌ | 手动输入问题 |

**结论**：没有插件同时做到“自动检测截图 + 自动弹出 + 自动提问 + 可接自有 API”，因此自研。

## 三、网页版接入

目标是不填官方 API Key，用 DeepSeek / ChatGPT 网页版回答截图。

| 路线 | 做法 | 问题 |
| --- | --- | --- |
| 扩展内直接自动化网页 | 内容脚本上传图片、填问题、抓回答 | 受控输入、Cloudflare、登录、DOM 改版；易违反 ToS；抓取脆弱 |
| 本地 OpenAI 兼容适配器 | 适配器操作网页版，SnapAsk 只发 OpenAI 请求 | 需运行额外服务；适配器本身也是逆向项目 |

选择第二条：

| 项目 | 网页版 | 默认地址 | 图片输入 | 认证 |
| --- | --- | --- | --- | --- |
| [NIyueeE/ds-free-api](https://github.com/NIyueeE/ds-free-api) | DeepSeek | `127.0.0.1:22217/v1` | ✅ `image_url` / 文件 | DeepSeek 账号 + 适配器 Key |
| [lanqian528/chat2api](https://github.com/lanqian528/chat2api) | ChatGPT | `127.0.0.1:5005/v1` | ✅ 图片/文件 | ChatGPT AccessToken/RefreshToken |

落地方式：

- 设置页内置 DeepSeek / ChatGPT 两个适配器预设；
- ChatGPT 支持可视化登录、自动抓 Token、多账户切换；
- DeepSeek 支持登录后自动抓 device_id，密码在适配器管理页输入；
- 复用现有 OpenAI 兼容层：`image_url`、SSE、追问、超时/错误处理；
- 不在扩展内实现网页 DOM 自动化。

## 四、技术验证

- MV3 Service Worker 不能直接读剪贴板 → 使用 `chrome.offscreen` + `execCommand('paste')`。
- `navigator.clipboard.read()` 在无焦点文档不可用，作为备选。
- `chrome.tabs.captureVisibleTab` 有约 2 次/秒限制，项目内做了节流。
- 扩展 Service Worker 在 `host_permissions` 下请求任意 API 不受页面 CORS 限制。
- Anthropic 需要 `anthropic-dangerous-direct-browser-access: true`。
- ChatGPT 网页版 Token 通过同源 `/api/auth/session` 获取；DeepSeek device_id 通过主世界 `SMSdk.getDeviceId()` 获取。

## 五、参考链接

- ScreenAsk: <https://chromewebstore.google.com/detail/screenask-%E2%80%93-screenshot-ai/cnockdfimpdglnpbjbojompboheilaie>
- Screenshot GPT: <https://chromewebstore.google.com/detail/screenshot-gpt/oajolpihbjfgdidkffnodiilpnhfbhmn>
- SnipSolve AI: <https://chromewebstore.google.com/detail/snipsolve-ai-screenshot-q/fjehagceeddnbhaegakpeogackjfplhh>
- CropView: <https://chromewebstore.google.com/detail/cropview-screenshot-to-ai/bhndjjfmcigpbhcheocmffccanbboikk>
- ds-free-api: <https://github.com/NIyueeE/ds-free-api>
- chat2api: <https://github.com/lanqian528/chat2api>
- Chrome offscreen: <https://developer.chrome.com/docs/extensions/reference/api/offscreen>
- `captureVisibleTab`: <https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab>
