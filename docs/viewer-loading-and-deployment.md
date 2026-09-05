# 查看器加载与部署约定

本文负责页面与插件的加载边界、公共运行时资产分发和部署验证。接口与路由见[插件协议](viewer-plugin-protocol.md)，源码产物管理见[源码构建规范](viewer-source-built-dependencies.md)。

## 1. 页面与代码加载

`/{locale}/view` 由 Server Component 输出页面外壳，`FileWorkspace` / `ViewerHost` 在浏览器取得文件并打开插件。[locale layout](../src/app/[locale]/layout.tsx) 只为已发布语言生成静态参数；当前发布英语和简体中文。

当前使用普通 Next.js 部署，生产执行 `next build --webpack`，开发执行 `next dev`。静态预渲染不等于 `output: "export"`：现有响应头依赖 [next.config.ts](../next.config.ts)。若改用静态导出，托管服务器必须另行配置等价响应头。

```text
页面外壳 → 纯数据 manifest
浏览器选择文件 → 候选的动态 probe → 选中插件的动态实现 → 实际需要的运行时资产
```

- 网站外壳只静态导入插件 `/manifest`，不得静态导入插件根入口或共享 renderer。
- Manifest 不访问浏览器全局，不导入运行时文案、解析器或重型依赖。
- Probe 通过独立动态入口加载，只做有界探测，不初始化完整 renderer、重型 Worker/WASM。
- DOM、文件读取和引擎初始化发生在浏览器运行阶段；模块顶层不初始化这些资源。
- 页面字典按 locale 在服务端加载，插件文案随完整实现加载；Server → Client props 可序列化，本地 `File` / handle 保留在客户端。
- SSG/SSR 只生成外壳，不读取用户文件，也不在服务端初始化浏览器运行时。

新增插件须更新 [注册表](../src/lib/viewer-registrations.ts)和[资产策略](../viewer/plugin-policies.json)。没有独立运行时资产也要显式声明空 `runtimeSets`。注册顺序仅用于同等级排序，不能替代内容 probe。

## 2. 资产来源与准备

代码分包与资产分发分别管理。资产包括 Worker、WASM、glue、字体、色彩配置和解码数据。

| 来源 | 可恢复输入 | 部署产物 |
|---|---|---|
| npm 包 | 精确依赖与 lockfile | prepare 复制到版本化 `public/vendor`，或由 bundler 输出 |
| 源码构建 | `tools/` 配方与 `third_party/` 审核产物 | prepare 校验清单、大小和 SHA-256 后复制 |
| bundler | 插件动态入口中的资产引用 | `/_next/static` 内容哈希资源 |

`public/vendor/` 是 Git 忽略的生成目录，不能作为唯一来源。`pnpm dev` 和 `pnpm build` 先执行 `prepare:assets`；具体脚本由 [package.json](../package.json) 维护。普通应用构建不编译 native 依赖。

许可证原件位于 `licenses/` 或 `third_party/`，prepare 同时复制需要公开分发的材料。可从 npm 恢复的二进制不重复提交到 `third_party/`。

精确版本、资源模式、冷启动集合和来源顺序统一维护在 [plugin-policies.json](../viewer/plugin-policies.json)，不在本文另存一张容易过时的版本与体积表。格式专属初始化与许可细节保留在对应 runtime、构建配方及领域架构中。

## 3. 分发与初始化回退

应用页面和 Next.js chunk 由 Vercel 提供；大型公共运行时使用 jsDelivr 或受控资产域名 `assets.anyfile.top`（R2 + CDN）。应用域名直接使用 Vercel CDN，不以 Cloudflare 反向代理作为常规拓扑。

### 选择来源

- 小资源默认同源。
- 有可靠、不可变公共发布的较大资源：公共 CDN → 受控镜像 → 同源。
- 没有可靠公共发布的自建产物：受控镜像 → 同源。
- npm CDN URL 锁定精确版本；源码审核产物的 jsDelivr URL 锁定公开仓库完整 Git commit，不能用浮动分支或 tag。
- 模块 Worker、pthread 或相对导入链确实要求同源时，保留同源执行入口；glue/WASM 能否外置由实际初始化链决定。

满足以下任一门槛，默认接入外部分发：单资源传输量 ≥ 2 MiB、典型冷启动运行资产合计 ≥ 4 MiB，或预计月度 Vercel 数据传输达到套餐额度的 10%。前两个门槛由资产策略和构建检查执行；月度流量需单独观察，不是构建检查项。

体积按响应压缩后的实际传输量评估，不能使用整个 vendor 目录的磁盘大小。典型冷启动只计该插件打开所需公共资产，不计页面外壳、无关插件和用户本地文件；互斥 bundle 分开计算。CI 使用确定性 gzip 估算，部署验收使用浏览器 transferred size。

达到体积门槛仍需同源时，策略中的 `sameOriginException` 必须记录原因、架构依据和实测 gzip 字节数。依赖升级时重新评估，不通过提高门槛掩盖加载错误。

### 回退语义

复用 [@anyfile/runtime-assets](../viewer/runtime-assets/src/index.ts) 的逐源初始化编排：每个来源只试一次，失败实例先清理，再尝试下一来源；取消时不再尝试后续来源。进行中的初始化如何响应取消，以及 Worker 或引擎的具体创建与释放，由调用方实现。

回退仅覆盖资源获取、Worker 创建和引擎初始化。文件损坏、格式不支持、查询或解码失败不得触发重新切换资产来源；不要把整次 `open()` 包进回退循环。

所有来源提供同一精确版本。默认保留同源 fallback；确需省略时，在该运行时架构中说明不可用行为和失败 UI。同源 fallback 解决外部资产不可达，不意味着应用具备完整离线缓存能力。

## 4. 响应头与导航

### 查看页隔离

`next.config.ts` 为合法 locale 的查看页设置以下头，实际发布路由由 locale 配置决定：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

这支持 LibRaw pthread 等需要隔离的运行时，不要求所有插件使用多线程。首页和格式介绍页不属于此计算环境。不要为了加载某个远程资源而关闭整个查看页隔离。

COOP/COEP 在顶层文档响应时生效。进入或离开查看页必须通过 [IsolationBoundaryLink](../src/components/isolation-boundary-link.tsx) 完整导航；文件、目录和插件切换仍使用客户端状态。切换语言完整导航并清空本地文件选择。

Worker 是独立上下文：仅给页面加头不够。同源 Worker/WASM 路径按 `next.config.ts` 设置 COEP/CORP；`/_next/static` 也在此范围。若使用 `assetPrefix` 或迁移静态 CDN，必须同步验证跨源响应策略。

### 公共资产

版本化同源 `/vendor` 以及外部不可变资产使用：

```text
Cache-Control: public, max-age=31536000, immutable
```

外部公共资产还需允许无凭据读取并提供适合跨源嵌入的响应：

```text
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
```

WASM 使用 `application/wasm`，JavaScript/Worker 使用正确 JavaScript MIME。发布新内容必须使用新版本或内容哈希路径，不能覆盖已有不可变 URL。验证最终 URL、重定向、CORS/CORP、MIME 和缓存，不能仅凭 CDN 品牌判断兼容。

### CSP 与文件子资源

当前 `next.config.ts` 未设置 CSP。新增 CSP 时需结合实际加载方式覆盖同源、jsDelivr 和资产域名的 fetch / 模块导入，允许需要的同源与 Blob Worker、WebAssembly，并在目标浏览器验证；不能把一段 `connect-src` 示例当作完整策略。

用户文件中的 URL 不属于公共运行时资产。不得自动加载任意远程子资源或通过本站 API/rewrite/Worker 代理任意 URL；具体内容安全规则见[渲染规范](viewer-rendering-guidelines.md)。

## 5. 依赖与构建门禁

关键运行时依赖使用精确版本，内部包使用 `workspace:*`，CI 使用 `pnpm install --frozen-lockfile`。Node 与 pnpm 版本以 [package.json](../package.json) 的 `engines` / `packageManager` 为准，部署平台保持一致。

`pnpm build` 包含 prepare、Next.js 构建及以下检查；失败阻止产物部署：

| 检查 | 职责 |
|---|---|
| [check-view-bundle.mjs](../scripts/check-view-bundle.mjs) | 从 `/en/view` HTML 检查首包 gzip 预算、重型实现隔离和专属资源 |
| [check-plugin-bundles.mjs](../scripts/check-plugin-bundles.mjs) | 根据实际动态 chunk 图检查 manifest、probe、插件入口及单 chunk 预算 |
| [check-plugin-assets.mjs](../scripts/check-plugin-assets.mjs) | 注册与策略覆盖、资产完整性、版本和外部分发门槛 |
| [check-ffmpeg-bundles.mjs](../scripts/check-ffmpeg-bundles.mjs) | 共享 FFmpeg 的专属体积与依赖边界 |

预算以脚本和策略文件为准，报告位于 `.next/diagnostics/`。这些检查不证明线上 CDN 可用，也不验证部署实际响应头。

## 6. 变更验收

- 代码或依赖变更运行相关测试、`pnpm lint` 和 `pnpm build`；检查新增依赖只进入实际调用插件的延迟 chunk。
- 部署配置变更验证已发布查看页预渲染；从非隔离页面真实点击进入查看页，确认 `crossOriginIsolated === true`，离开时完整导航。
- 运行时接入或升级验证正常来源、逐层阻断与同源 fallback，确认失败实例清理、取消停止、文件错误不触发来源回退。
- 在真实部署验证最终资产响应头、缓存与传输量，以及目标浏览器的 Worker/WASM 初始化。
- 源码产物升级另遵守[源码构建规范](viewer-source-built-dependencies.md)。
