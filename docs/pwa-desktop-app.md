# PWA 桌面应用与离线支持规划

本文记录将站点改造为可安装桌面应用（PWA）、支持系统双击打开本地文件及离线使用的能力边界与设计方向。

## 目标

- **独立桌面窗口**：用户可在桌面浏览器中将站点安装为独立应用，启动直接进入查看页工作区（`/{locale}/view`）。
- **系统文件关联**：支持通过操作系统「打开方式」或双击本地文件，直接拉起本应用查看。
- **按需离线可用**：断网状态下可正常打开应用外壳及已缓存过运行时的文件格式。

## 能力与边界

### 1. 桌面应用安装（PWA）

- 通过 Web App Manifest 与图标配置提供独立窗口体验。
- 启动入口固定为查看页工作区，避免与非隔离的营销/介绍页之间发生跨源隔离边界切换。

### 2. 双击文件打开（File Handling API）

- 依赖桌面端 Chromium（Chrome / Edge，覆盖 Windows、macOS、Linux、ChromeOS）；Safari、Firefox 及移动端不支持，且必须先安装为桌面应用才生效。
- **扩展名上限约束**：Chromium 限制全局最多注册 300 个文件扩展名，单个扩展名不超过 16 字符，且系统会限制可执行等高危后缀。
- 当前站点支持的格式总数已超过 300 个，注册清单需按使用频率精选核心查看格式（如文档、图片/RAW、CAD/3D、电子书、音视频、压缩包等），不将全量格式写入清单。
- 首次通过系统打开文件需经用户授权确认，不静默劫持系统默认程序。

### 3. 离线使用（Service Worker + Cache Storage）

当前运行时资产（`public/vendor/` 及外置 WASM/Worker）总计约 150 MiB，不适合安装时全量预缓存，采用分层缓存策略：

- **安装时预缓存**：查看页外壳、核心脚本与样式、轻量原生查看能力，确保断网可启动应用并查看基础格式。
- **运行时按需缓存**：版本化不可变资产（Next.js 静态 chunk、`/vendor/`、`assets.anyfile.top`、jsDelivr）在首次在线打开对应格式后缓存，后续断网可直接复用。
- **可选扩展**：后续可按需提供分类离线包手动下载入口。

### 4. 跨源隔离约束

查看页依赖 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp` 以支持多线程 WASM（`SharedArrayBuffer`）：

- 离线缓存的查看页文档必须保留 COOP/COEP 响应头。
- 跨源运行时资产必须以 CORS 模式缓存，禁止产生 opaque 响应；外置资产需继续满足 `Access-Control-Allow-Origin: *` 与 `Cross-Origin-Resource-Policy: cross-origin`（参见 [viewer-loading-and-deployment.md](viewer-loading-and-deployment.md)）。
