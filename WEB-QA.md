# 网页问答接入

SnapAsk 可以用 **DeepSeek / ChatGPT 网页版**回答截图，不需要官方 API Key。

```
SnapAsk（截图 / 面板）
      │ OpenAI 兼容请求（含 image_url）
      ▼
本机适配器（ds-free-api / chat2api）
      │ 使用你的网页登录态 / Token
      ▼
DeepSeek / ChatGPT 网页版
```

适配器在本机运行，负责登录态、上传图片、网页改版；SnapAsk 只负责截图、面板和 OpenAI 兼容调用。

## 一、选择适配器

| 网页版 | 适配器 | 默认地址 | 账户绑定 |
| --- | --- | --- | --- |
| DeepSeek | [ds-free-api](https://github.com/NIyueeE/ds-free-api) | `http://127.0.0.1:22217/v1` | 插件抓 device_id，适配器管理页填邮箱/密码 |
| ChatGPT | [chat2api](https://github.com/lanqian528/chat2api) | `http://127.0.0.1:5005/v1` | 插件登录后自动抓 Token，直接可用 |

> 两者都是社区逆向项目，非官方接口；可能违反网页版服务条款、导致账号风控，且会随网页改版失效。请使用专用账号，只在本机运行，不要暴露端口。

## 二、ChatGPT（chat2api）

### 1. 启动 chat2api

默认端口 `5005`：

```bash
docker run -d --name chat2api \
  -p 5005:5005 \
  -e AUTHORIZATION=your_local_password \
  lanqian528/chat2api:latest
```

也可以按项目 README 直接运行 Python。

### 2. 在插件里登录

设置页 → **网页问答账户** → ChatGPT → **登录 ChatGPT**。

1. 浏览器打开 `chatgpt.com`，完成登录。
2. 插件在后台读取同源 `/api/auth/session`，自动抓取 `accessToken` 和邮箱。
3. 账户出现在列表里，插件自动切换到 chat2api：
   - Base URL：`http://127.0.0.1:5005/v1`
   - 模型：`gpt-4o`
   - API Key：抓到的 Token
4. 点“检测适配器”或“测试连接”确认。

### 3. 多账户

- 点击账户行切换当前账户。
- “刷新 Token”会重新打开 ChatGPT 并抓取最新 Token。
- “删除”移除账户；删除当前账户会自动切换到下一个。
- Token 到期后账户会标记“已过期”，重新登录即可。

> chat2api 支持直接传 AccessToken 作为 Bearer，所以插件不需要把 Token 上传到 chat2api 的 Token 池。

## 三、DeepSeek（ds-free-api）

DeepSeek 适配器需要 **邮箱 + 密码 + device_id** 才能登录。为了安全，插件只抓取 device_id，**不会保存你的 DeepSeek 密码**；密码在 ds-free-api 管理页输入。

### 1. 启动 ds-free-api

推荐按项目官方 Docker Compose 部署，默认端口 `22217`：

```bash
git clone https://github.com/NIyueeE/ds-free-api
cd ds-free-api
cp docker/config.example.toml docker/config/config.toml
# Docker 端口映射需要 host = "0.0.0.0"
docker compose -f docker/docker-compose.yaml up -d
```

也可以从 releases 下载二进制运行。

### 2. 在插件里登录 DeepSeek

设置页 → **网页问答账户** → DeepSeek → **登录 DeepSeek**。

1. 浏览器打开 `chat.deepseek.com/sign_in`，完成登录。
2. 插件在页面主世界执行 `SMSdk.getDeviceId()`，自动抓取 device_id（并尽力读取邮箱）。
3. 卡片显示 device_id 和“复制 device_id”按钮。
4. 点“适配器管理页”打开 `http://127.0.0.1:22217/admin`：
   - 首次访问设置管理密码；
   - 添加账户：邮箱、密码、device_id（粘贴刚才复制的值）；
   - 保存后适配器会自动登录。
5. 回到插件：
   - 点 **使用此适配器**（切到 DeepSeek 预设）；
   - 在下方 **API 配置 → API Key** 填 ds-free-api 管理页创建的适配器 Key；
   - 点“检测适配器”或“测试连接”。

### 3. 关于识图

ds-free-api 支持将 `image_url` / 文件上传到 DeepSeek 会话。但 DeepSeek 网页端在 2026-09 左右下线了独立 `vision` 模式，实际识图效果需要用自己的账号测试：

- 如果截图能被正确理解：可以继续使用；
- 如果模型忽略图片：改用 ChatGPT 网页版、免费视觉 API 或本地 Ollama。

## 四、账户与 Key 的关系

- **ChatGPT**：账户 Token 就是 API Key。插件登录后自动填入；切换账户会切换 Key。
- **DeepSeek**：账户在 ds-free-api 管理页维护；插件 API Key 是 ds-free-api 签发的适配器 Key。适配器会自动轮询已绑定账户。
- 切换适配器后需要重新确认 API Key/Token；不同适配器不通用。

## 五、安全

- 只绑定 `127.0.0.1`，不要用 `0.0.0.0` 或公网 IP 暴露端口。
- 使用专用账号，不要用主账号。
- Token / 密码等同于账号访问权限；适配器可能记录日志，请阅读对应项目说明。
- 插件不会保存 DeepSeek 密码；ChatGPT Token 保存在本机 `chrome.storage.local`，不经过 SnapAsk 服务器。
- 适配器失效时，SnapAsk 会显示 HTTP/网络错误；可随时切回官方 API、免费 API 或本地 Ollama。

## 六、排错

| 现象 | 排查 |
| --- | --- |
| `Connection refused` | 适配器没启动或端口不对；确认 Docker 端口映射 |
| `401 / 403` | ChatGPT Token 过期，重新登录；DeepSeek 检查适配器 Key 和管理页账户 |
| `404` | Base URL 少 `/v1`，或模型名不对 |
| `400` 且提示图片 | 适配器/网页版不支持图片；换 ChatGPT 或视觉 API |
| ChatGPT 登录后没出现账户 | 确认已登录 chatgpt.com；点“刷新 Token”；检查是否被扩展拦截 |
| DeepSeek 没抓到 device_id | 确认已登录；DeepSeek 页面完全加载后重试；仍不行可在 DevTools 执行 `SMSdk.getDeviceId()` 手动获取 |
| 检测适配器失败但 curl 正常 | 检查 Base URL 是否为 `http://127.0.0.1:端口/v1` |

## 七、测试说明

插件用本地 OpenAI 兼容 mock 验证了：

- ChatGPT 假 Token 的账户存储、切换、删除、过期显示；
- chat2api 预设、测试连接、截图 `image_url`、Authorization；
- DeepSeek device_id / 邮箱抓取、session 存储、卡片展示；
- 适配器 `/v1/models` 检测。

真实 ChatGPT / DeepSeek 登录需要账号，未在自动化环境中完成登录测试；请按上面的步骤用自己的账号验证。
