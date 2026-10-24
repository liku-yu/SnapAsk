# SnapAsk 隐私政策

生效日期：2026-10-24

SnapAsk 是一个本地运行的浏览器扩展。本政策说明它如何处理你的数据。

## 一、我们不收集什么

- 不收集账号、姓名、邮箱、设备标识等个人信息；
- 不收集浏览历史、页面内容、使用统计或遥测；
- 没有 SnapAsk 服务器，不向作者或第三方中转数据；
- 不出售、不共享任何用户数据。

## 二、本地存储

使用 `chrome.storage.local` 保存：

- 设置：Base URL、模型、提示词、开关状态；
- API Key / DeepSeek 适配器 Key / ChatGPT 网页版 Token；
- ChatGPT 网页版账户列表（邮箱、Token、到期时间）；
- 剪贴板图片哈希（仅用于去重）和监听状态。

`chrome.storage.session` 保存：

- DeepSeek 登录时抓取的 device_id / 邮箱；
- 独立窗口的临时截图（读取后立即删除，浏览器关闭即清空）。

以上数据只在本机，**不会通过 Chrome 同步**。

> `chrome.storage.local` 不是加密存储。能访问你本机浏览器用户目录的人或恶意软件可以读取其中的 Key/Token。建议使用单独签发、限额的 Key，并开启系统磁盘加密。

## 三、Key / Token 处理

- 完整 API Key / Token 只由 background service worker 使用发起请求；
- 内容脚本、工具栏弹窗、独立窗口只接收 `hasApiKey` 布尔值，不接收 Key 本身；
- 设置页为了编辑会直接读取本地存储，API Key 输入框为密码类型；
- API 错误在展示前自动脱敏：移除用户 Key、`Bearer ...`、JWT、`sk-...`、`x-api-key` 等模式；
- 不会把 Key / Token 写入浏览器控制台日志；
- 网页内面板使用 closed Shadow DOM，网页 JS 无法读取面板中的截图和回答。

## 四、剪贴板

开启“自动检测截图”时，扩展会定时读取系统剪贴板：

- 只提取图片，不读取文字、文件或其他内容；
- 计算 SHA-256 哈希用于去重；
- 新图片显示在面板中，并在启用“自动提问”时发送给你配置的 API/适配器。

关闭插件或关闭自动检测后，剪贴板监听文档会被销毁。

## 五、网络请求

使用 AI 问答时，以下内容会发送到**你配置的 API 或本机适配器**：

- 截图（压缩为 WebP/JPEG）；
- 问题、默认问题、对话上下文、系统提示词。

请求由浏览器直接发往 Base URL，不经过 SnapAsk 服务器。

### 网页问答（DeepSeek / ChatGPT）

- 截图先发到本机适配器（通常 `127.0.0.1`）；
- 适配器再使用你的网页登录态 / Token，把截图发送到 DeepSeek / ChatGPT；
- 适配器可能保存 Token、请求日志或截图，具体取决于第三方项目；
- 插件不保存 DeepSeek 密码；ChatGPT Token 保存在本机；
- 请阅读对应适配器的隐私说明，并使用专用账号。

## 六、权限

| 权限 | 用途 |
| --- | --- |
| `storage` | 设置、账户、去重状态 |
| `scripting` | 注入面板、抓取 device_id |
| `offscreen` | 创建剪贴板监听文档 |
| `clipboardRead` / `clipboardWrite` | 读取截图 / 复制回答和 device_id |
| `contextMenus` | 右键截图入口 |
| `<all_urls>` | 在任意网页显示面板，并请求任意 API/本机适配器 |

## 七、删除数据

- 设置页“清除运行数据”：删除剪贴板哈希与监听状态；
- “恢复默认设置”：清除包括 Key 在内的所有设置；
- 删除 ChatGPT 账户：移除对应 Token；
- 卸载扩展：删除全部本地存储。

## 八、联系方式

如有疑问，请通过项目仓库提交 issue。
