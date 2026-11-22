# PWA 桌面应用与离线支持

本文说明 Anyfile 的桌面应用安装（PWA）、系统文件关联（File Handling API）与分层离线缓存实现。

## 1. 桌面应用安装（Web App Manifest）

- 静态 Manifest 路由由 [src/lib/pwa/manifest.ts](../src/lib/pwa/manifest.ts) 生成：
  - `/en/manifest.webmanifest`（`start_url: "/en/view"`）
  - `/zh-CN/manifest.webmanifest`（`start_url: "/zh-CN/view"`）
  - `/manifest.webmanifest`（默认英文回退）
- [LocaleLayout](../src/app/[locale]/layout.tsx) 为每个已发布语言链接对应的 Manifest，并设置固定 `id: "/view"`、`scope: "/"`、`display: "standalone"`、192/512 PNG 图标（`any` + `maskable`）与 `launch_handler: { client_mode: ["focus-existing", "auto"] }`。
- 启动入口直接进入查看页工作区（`/{locale}/view`），避免启动时跨过非隔离页面与隔离查看页之间的 COOP/COEP 边界。
- [PwaInstallButton](../src/components/pwa-install-button.tsx) 默认隐藏，仅在非 `standalone` 模式且浏览器支持 `navigator.install()` 或触发 `beforeinstallprompt` 时显示安装入口。

## 2. 系统双击打开文件（File Handling API）

- 文件关联清单维护在 [src/lib/pwa/file-handlers.ts](../src/lib/pwa/file-handlers.ts)，所有分组 `action` 指向 `/{locale}/view`，`launch_type` 为 `"single-client"`（同时多选多个文件时在同一个工作区打开）。
- 清单受单元测试（[src/lib/pwa/manifest.test.ts](../src/lib/pwa/manifest.test.ts)）强制约束：
  - 精选高频查看格式，唯一扩展名总数远低于 Chromium 300 个上限，单个扩展名不超过 16 字符且仅限单点后缀。
  - 排除可执行程序、脚本、安装包、证书安装器与 `.html`/`.chm` 等高危或浏览器接管后缀。
  - 每个注册扩展名都必须对应站点已支持的查看器插件。
- [FileWorkspace](../src/components/file-workspace.tsx)（非嵌入模式）通过 `window.launchQueue.setConsumer()` 接收系统传入的文件或目录句柄，直接加载到工作区；结合 `focus-existing` 支持已开窗口复用。
- 能力边界：依赖桌面端 Chromium（Chrome / Edge，覆盖 Windows、macOS、Linux、ChromeOS），需先安装为桌面应用并经用户首次授权确认；Safari、Firefox 及移动端不支持。

## 3. 分层离线缓存（Service Worker）

Service Worker 位于 [public/sw.js](../public/sw.js)，由 [PwaLifecycle](../src/components/pwa-lifecycle.tsx) 在生产安全上下文注册（作用域 `/`），[next.config.ts](../next.config.ts) 为 `/sw.js` 配置 `Cache-Control: no-cache, no-store, must-revalidate` 与 `Service-Worker-Allowed: /`。

当前全量运行时资产约 150 MiB，采用两层缓存策略：

- **安装时预缓存（`anyfile-shell-v1` + 初始壳层块）**：预缓存 `/en/view`、`/zh-CN/view`、图标与 Manifest，并自动提取页面引用的初始 `/_next/static/*` JS/CSS/字体块写入缓存，确保安装后断网即可启动工作区并使用轻量本地查看能力。
- **运行时按需缓存（`anyfile-runtime-v1`）**：
  - 同源不可变资产（`/_next/static/*`、`/vendor/*`）：Cache-First，仅缓存 HTTP 200 的 `basic` 响应（不缓存 206 分段响应）。
  - 受信任跨源版本化运行时（`https://assets.anyfile.top/vendor/*`、`https://cdn.jsdelivr.net/npm/*`）：Cache-First，首次在线打开对应格式后自动缓存，断网可直接复用；未缓存格式在离线状态下由 [ViewerHost](../src/components/viewer-host.tsx) 给出明确的离线提示。
  - 同源导航（`/{locale}/view`）：Network-First 并后台刷新壳层块，断网回退到规范化路径缓存（去除 `?entry=...` 查询参数）。
  - 非 GET 请求、`Range` 请求、统计脚本与用户打开的任意公开文件链接（`#file=`）完全绕过 Service Worker，不拦截、不缓存。

## 4. 跨源隔离约束

- 查看页文档必须携带 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp` 才允许写入缓存，离线回退完整保留原始响应头。
- 跨源运行时资产强制使用 `{ mode: "cors", credentials: "omit" }` 请求，且仅在响应满足 `status === 200`、`type === "cors"` 且 `Cross-Origin-Resource-Policy: cross-origin` 时写入缓存，禁止产生或缓存 opaque 响应（参见 [viewer-loading-and-deployment.md](viewer-loading-and-deployment.md)）。
