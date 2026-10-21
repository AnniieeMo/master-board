# 万事屋安全中转

页面继续托管在 GitHub Pages。浏览器调用 Cloudflare Pages 入口，入口通过 Service Binding 在 Cloudflare 内部调用专用 Worker，再由 Worker 访问智谱。专用 Worker 关闭 `workers.dev` 和版本预览地址，只允许内部绑定调用。Pages 入口解决本轮网络中 `workers.dev` 解析／连接异常的问题，不绕过鉴权或关闭浏览器安全机制。

## 密钥与登录

1. 智谱 Key 只配置在 Worker 的 `ZHIPU_API_KEY` Secret 中，不写入仓库或前端包。
2. 首次登录时，工作台把用户输入的 Key 发送到自己的中转 `/session`。服务器与 Secret 比对后，签发限定用途、有效期 30 天的 HMAC 登录凭据。
3. 登录成功后，工作台清除其保存的原始 Key，后续用登录凭据请求模型。凭据只存当前浏览器，不加入日程同步或求职备份。
4. 服务器轮换智谱 Key 会使旧登录凭据全部失效。每台设备需重新登录。登录凭据本身也属敏感信息，不应分享。

已有浏览器明文 Key 只会在成功登录后迁移，不会在尚未配置服务时删除。浏览器密码管理器或用户自己保存的副本不在此迁移范围内。

## 访问与费用保护

- 仅允许 `https://anniieemo.github.io` 作为浏览器来源，同时校验有效签名；不能只凭 Origin 调用模型。
- 登录每分钟 5 次、模型请求每分钟 15 次。Cloudflare 原生限流按边缘机房计数，属于防滥用措施，不是全球硬额度或账单上限。
- 固定智谱上游、模型允许列表、每次最多 4096 输出 token、6 MB 输入；拒绝任意目标地址及远程图片 URL。
- 不自动重放失败的模型请求，不记录聊天正文、图片、密钥或登录凭据；Worker Observability 关闭。
- 错误分为登录、上游鉴权／额度、请求校验、限流和连接失败；不会统一归因于 VPN。

对话及图片会经 Cloudflare 再发往智谱。涉及客户或公司资料时，应先脱敏并遵守所在组织的数据政策。供应商自身的处理政策仍适用。

## 部署与维护

从本仓库根目录运行：

```sh
node --test relay/relay.test.mjs
npx --yes wrangler@4.151.3 login
npx --yes wrangler@4.151.3 deploy --config relay/wrangler.jsonc
```

Pages 入口从 `relay/gateway` 目录部署。该 Wrangler 版本默认将新 Pages 创建委派给 Workers；`--force` 仅表示明确使用原 Pages API，不是覆盖现有代码或强制推送 Git。

```sh
npx --yes wrangler@4.151.3 pages deploy public --project-name master-board-relay-gateway --branch main --commit-dirty=true
```

仅在项目不存在时用 `pages project create master-board-relay-gateway --production-branch main --force` 创建；不要重复创建。已有项目的部署不需要 `--force`。Service Binding 必须指向 `master-board-relay`。

上传 Secret 时使用隐藏输入，不把值放在命令参数中：

```sh
npx --yes wrangler@4.151.3 secret put ZHIPU_API_KEY --config relay/wrangler.jsonc
```

也可运行临时的本机配置页：

```sh
node relay/configure.mjs https://master-board-relay-gateway.pages.dev
```

该页只监听 `127.0.0.1`，路径使用随机值，输入通过 Wrangler stdin 上传 Secret，不保存到本地文件。配置后关闭进程；它最多存活 45 分钟。本机 QA 会话可从该临时进程取得已验证的登录凭据，仅用于验证模型链路，不会输出凭据。

健康检查 `/health` 不产生模型费用；`configured: true` 只表示已配置 Secret，真实模型是否可用仍以带鉴权请求为准。

## 本轮验证 · 2026-10-21

19 项 Node 自动测试通过；浏览器在工作台同源环境中通过真实连接测试，正常流式聊天返回「连接正常。」；无效登录凭据返回 401。浏览器测试使用空日程，没有发送真实日程内容，也未触发任何日程写回。375 px 界面无横向溢出，手机实际网络尚未实机验证。

Cloudflare 出站 fetch 使用 `redirect: "manual"` 并拒绝 3xx，不能使用其运行时不支持的 `redirect: "error"`。连接测试给推理模型保留 1024 token，避免原有极小预算全部被思考阶段消耗；测试不更改聊天模型或关闭思考能力。
