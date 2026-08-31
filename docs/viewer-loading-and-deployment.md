# 查看器加载、渲染与部署约定

本文记录查看器插件在 SSG、SSR、依赖锁定、jsDelivr 和构建体积方面的约定。修改插件注册、依赖或部署配置时，应同时检查本文列出的边界。需要从 C/C++/Rust 等上游源码自行生成 WASM、Worker 或 JavaScript glue 时，还必须遵守 [源码构建型第三方依赖规范](viewer-source-built-dependencies.md)。

## 1. SSG 与 SSR 支持

当前已发布的 `/en/view` 与 `/zh-CN/view` 在生产构建中按 locale 静态预渲染。`src/app/[locale]/layout.tsx` 只为 `PUBLISHED_LOCALES` 生成静态参数并禁用动态参数；未发布语言不生成页面。以后即使页面因为读取请求数据、Cookie 等原因改为请求时 SSR，查看器架构也不需要改变。

渲染边界如下：

```text
Next.js Server Component: src/app/[locale]/view/page.tsx
                │
                ▼
Client Component: FileWorkspace / ViewerHost
                │
                ├── 服务端预渲染时：只读取纯数据 manifest
                │
                └── 浏览器选择文件后
                    ├── 候选 registration.probe()：按需加载轻量 probe
                    └── registration.load()：按需加载选中的完整插件
```

必须保持以下规则：

- `manifest.ts` 只能包含纯数据和类型，不得在模块顶层访问 `window`、`document`、`navigator`、`Worker` 或 `WebAssembly`。
- 网站外壳只能静态导入插件的 `/manifest` 导出；probe 和完整插件实现必须通过注册项中的 `import()` 动态加载。
- File System Access API、文件 probe、Worker、WASM 和 DOM 操作只能发生在浏览器事件处理、effect、注册项 `probe()` 或插件 `open()` 中。
- 不要从 Server Component、layout、page 或网站外壳静态导入插件根入口。
- Server Component 传给 Client Component 的 props 必须可序列化；本地 `File` 和 `FileSystemHandle` 只能由浏览器取得并保留在客户端。
- 页面字典由 Server Component 按 locale 动态导入；插件运行时文案只随被选中的完整插件实现加载，不能进入 manifest 或未选择插件的首包。

遵守这些规则时：

- SSG/SSR 只生成页面外壳，不读取用户文件。
- 构建和服务端请求不会访问 jsDelivr，也不会初始化 Worker/WASM。
- 搜索引擎可以索引静态格式页和查看页的基础内容；真实文件预览仍只在浏览器运行。

### 静态预渲染不等于静态导出

当前生产命令是普通 `next build`，由 Next.js/Vercel 运行构建产物。语言前缀查看页虽然在构建期生成静态 HTML，部署时仍保留 Next.js 路由层，因此 `next.config.ts` 中的 `headers()` 会作用于页面和静态资源响应。这是“静态预渲染”，不是 `output: "export"`。

只有显式配置 `output: "export"` 并把 `out/` 交给通用静态服务器时，才属于真正的静态导出。静态导出不执行 Next.js 的响应头路由逻辑；部署服务器、对象存储或 CDN 必须为所有 `/{locale}/view`、Worker、WASM 和其他相关资产配置本文规定的 COOP、COEP、CORP、CORS、CSP 和 MIME 响应头。不能因为构建产生了 HTML 文件，就假定 `next.config.ts` 的响应头已经包含在文件中。

`/{locale}/view` 只承载对应语言的页面外壳和浏览器本地文件处理，当前应继续使用静态预渲染。SSG、SSR 和 ISR 决定页面何时生成以及是否使用服务端计算，不决定浏览器下载的静态资源由谁承担流量；大体积运行时的流量策略见第 3 节。

## 2. 插件级按需加载

`src/lib/viewer-registrations.ts` 是插件加载入口。每个插件由一个轻量 manifest、一个可选的动态 probe 和一个动态完整实现组成。

```text
manifest
└── 启动时静态加载，只含纯数据

probe（可选）
└── 扩展名成为候选后动态加载，只计算当前文件的支持等级

完整插件
└── 成为默认项或被用户选择后动态加载，负责 open() 和渲染
```

Probe 必须保持轻量。它可以分片读取必要文件头或容器结构，但不能为了路由初始化完整 renderer、重型 Worker/WASM 或执行完整文件解析。确实需要某个小型解析依赖才能判断支持等级时，该依赖只能进入 probe chunk 和对应插件 chunk，不能进入网站首包或无关插件。

SQLite 是独立插件，只依赖 `sql.js`。打开 SQLite 文件不会加载 DuckDB 或 Apache Arrow。DuckDB 数据插件处理 CSV、TSV、JSON、Parquet、Arrow 和 DuckDB 数据库，不包含 SQLite 路径。

`browser-video` 同样保持三段加载边界：manifest 只包含格式声明；候选扩展名命中后才加载纯字节、有界且无 DOM 副作用的 ISO BMFF/WebM probe；只有插件被选中后才加载 DOM、Object URL、当前 locale 的运行时文案和媒体生命周期实现。构建门禁同时检查 `/en/view` 首包不含 probe/parser、插件运行时字典或完整播放器，并检查 probe chunk 不带入完整播放器 UI。

新增插件时必须：

1. 为 manifest 和完整实现保留不同的导出路径；需要 probe 时再增加独立 `/probe` 导出。
2. 在注册表中静态导入 manifest，通过 `import()` 动态导入 probe 和完整实现。
3. 不需要精确路由的插件省略 probe，以默认支持等级 1 参与排序。
4. 注册顺序只作为同支持等级候选的稳定 tie-break；通用兜底插件仍放在末尾。
5. 运行 `pnpm build`，确认首包体积检查通过。

### PDF.js 支持资源

PDF 插件实现保持动态加载。`pnpm dev` 和 `pnpm build` 会先运行
`scripts/prepare-pdfjs-assets.mjs`，把已锁定版本 `pdfjs-dist` 的以下官方资源复制到
`public/vendor/pdfjs/<version>/`：

- `cmaps/`：复合字体的字符映射；
- `standard_fonts/`：PDF 标准字体的本地字体数据；
- `iccs/`：ICC 色彩配置；
- `wasm/`：JBIG2、OpenJPEG、QCMS 以及 PDF.js 官方 JavaScript 解码回退。

这些资源保持 PDF.js 发布包中的目录与文件名，浏览器只在具体 PDF 用到相应能力时按需请求。
资源与用户文件都走同源，不依赖 CDN；版本目录避免依赖升级后缓存混用。该目录是生成产物，
不提交仓库，但生产构建必须包含准备步骤。

## 3. 大体积运行时的 CDN 与回退

### 目标部署拓扑

目标生产环境采用以下职责分离：

```text
应用域名（Vercel）
├── 静态预渲染的页面外壳
├── 内容哈希化的 Next.js JavaScript / CSS
└── 小型或必须同源的支持资源

官方公共 CDN（当前为 jsDelivr）
└── npm 上游已发布、版本锁定的大型 WASM / Worker

受控资产域名（计划使用 Cloudflare R2 + CDN）
└── 自建产物和大型同版本 fallback
```

不在 Vercel 前再叠加 Cloudflare 反向代理作为常规部署方式。Cloudflare 可以继续负责 DNS，并通过独立资产域名提供 R2/CDN；应用域名直接使用 Vercel CDN。这样避免双层 CDN 的缓存、失效和诊断边界，同时让高流量的大型二进制不经过 Vercel 应用域名。

静态预渲染和 Vercel CDN 命中可以减少服务端计算与源站访问，但用户实际下载的页面和静态文件仍产生 CDN 数据传输。降低运行时流量成本的主要手段是按需加载、压缩、长期不可变缓存，以及把大型公共二进制放到官方 CDN 或受控资产域名，而不是把 `/{locale}/view` 改成 SSR。

### 加载与回退顺序

DuckDB JavaScript API 由应用自身打包。体积较大的 WASM 与 Worker 按以下顺序加载：

1. 使用 `getJsDelivrBundles()` 取得与已安装包版本一致的官方 jsDelivr URL。
2. 使用 `selectBundle()` 按浏览器能力选择 MVP 或 EH 版本。
3. 如果 CDN Worker 获取或 DuckDB 初始化失败，清理失败实例并使用构建产物中的同版本本地资源重试。
4. 如果本地初始化也失败，才向查看器上层返回错误。

回退只处理引擎加载/初始化失败。文件损坏、格式不支持或查询失败不会触发 CDN 到本地的重复初始化。

由于需要回退，当前部署产物仍会包含 DuckDB WASM 和 Worker。jsDelivr 减少正常流量对本站大文件分发的依赖，但不会缩小构建产物。迁移到 Cloudflare R2 前，本地回退继续保持同源；迁移后必须保留完全离线或 CDN 失败时的明确产品行为，不能静默变成无限重试。

项目的 local-first 含义保持不变：用户选择的文件不会上传到 jsDelivr 或应用服务器。jsDelivr 只收到公共 DuckDB 引擎资源的请求。

新增大体积运行时时，按以下顺序决策：

1. 优先使用上游官方、精确版本、可长期缓存的公共 CDN 资产。
2. 对每个真实 URL 校验 CORS、CORP、Content-Type、缓存、重定向和区域可用性，不能只根据 CDN 品牌推断兼容。
3. 上游 CDN 不满足要求时，把审核过的版本化产物放到受控资产域名；不能运行时代理任意用户 URL。
4. 只有小型资源、必须同源的 Worker 或尚未迁移的 fallback 才进入 Vercel 部署产物。
5. CDN 和 fallback 必须指向同一依赖版本，并由构建门禁交叉校验。

受控公共资产域名至少返回：

```text
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
Cache-Control: public, max-age=31536000, immutable
```

WASM 必须使用 `application/wasm`，JavaScript 和 Worker 必须使用正确的 JavaScript MIME。公开资产使用内容不可变的版本路径；升级时发布新路径，不覆盖旧对象。

### 部署头与网络策略

如果部署 CSP，需要至少验证以下来源：

```text
connect-src 'self' https://cdn.jsdelivr.net
worker-src 'self' blob:
```

具体 CSP 应与整站已有策略合并，并在目标浏览器上验证 Worker 和 WASM。完全离线或 CDN 被阻断时会使用本站资源，但应用自身的静态资源仍需可访问或由 Service Worker 缓存。

`/{locale}/view` 已经启用 COOP/COEP。当前 DuckDB 仍使用 MVP/EH 单线程资源；如果以后启用多线程 COI bundle，需要同步给 fallback 增加 COI WASM、主 Worker 和 pthread Worker，并继续保留经验证的单线程 bundle 作为浏览器能力 fallback。SSG/SSR 本身不受这一变化影响。

### 外部资源边界

`/{locale}/view` 是受控的本地文件计算环境，不是能够嵌入任意网站和远程资源的通用浏览器。插件默认不得因为用户文件中包含 URL，就自动加载远程图片、字体、媒体、tile、脚本或 iframe。

确有格式语义需要加载远程子资源时，接入评审必须逐项确认：

- 资源使用 CORS 请求并返回匹配的 `Access-Control-Allow-Origin`，或者对 no-CORS 请求返回允许嵌入的 CORP；
- 请求不发送用户文件内容、文件名、本地路径、凭据或不必要的 referrer；
- 来源是明确 allowlist，不把应用或 Cloudflare Worker 实现成任意 URL 的开放代理；
- 失败时只影响对应子资源，并向用户说明远程内容没有加载；
- 跨源 iframe 的文档及其子资源链满足 COEP，且不依赖被 COOP 切断的 opener 通信。

普通图床、对象存储、旧式 WMS/IIIF/tile 服务、视频分片服务和第三方嵌入页即使能在非隔离页面通过 `<img>`、`<video>` 或 `<iframe>` 打开，也不代表满足上述要求。官方 jsDelivr 的标准 npm/GitHub 资产当前符合已有运行时需要，但仍必须检查依赖实际生成的 URL、重定向和响应头。

## 4. 依赖版本锁定

查看器的关键运行时依赖在各插件 `package.json` 中使用精确版本.

`pnpm-lock.yaml` 锁定其余直接依赖和全部传递依赖的实际版本、下载地址与完整性哈希。根项目中的 `^` 版本不会在 `pnpm install --frozen-lockfile` 时漂移。

内部 `@anyfile/*` 依赖使用 `workspace:*`，只能解析到当前 pnpm workspace 中的包，不会从 registry 获取任意版本。

生产环境和 CI 必须使用：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

不要删除或忽略 `pnpm-lock.yaml`。升级关键依赖时应明确指定目标版本，提交对应 lockfile，并重新验证插件测试、CDN URL、本地回退和生产构建。

### 源码构建型依赖

当没有满足安全、许可、CSP 或功能裁剪要求的上游包，项目可以在有明确方案评审后自行构建第三方依赖。此类依赖不进入普通 pnpm 构建时的 native 编译流程，而采用：

```text
tools/<dependency>-build/                 可重复构建配方
        ↓
third_party/<dependency>/<version>/       提交 Git 的审核产物
        ↓ prepare
public/vendor/<dependency>/<version>/     不提交的部署资源
```

具体进入条件、版本、升级、patch、独立仓库门槛、安全与许可证要求见 [源码构建型第三方依赖规范](viewer-source-built-dependencies.md)。能够由锁定的 npm 上游包恢复的 PDF.js、LibRaw 等现有资产继续直接从 `node_modules` 准备，不重复 vendoring。

## 5. 首包体积门禁

`pnpm build` 会在 Next.js 构建后执行 `scripts/check-view-bundle.mjs`：

- 从 `/en/view` 的预渲染 HTML 读取真实初始脚本列表。
- 分别计算传输时的 gzip 体积。
- 当前上限为 225 KiB。
- 检查 Ace、DuckDB、SQLite、PDF、Word、Excel 和 PowerPoint 实现标记没有进入初始 JavaScript。
- 检查新增 probe 及其解析依赖没有进入初始 JavaScript；probe chunk 也不能静态带入完整插件实现。
- 检查 PDF.js Worker 已产出，且版本化 CMap、标准字体、ICC、WASM 和 JavaScript 解码回退齐全。
- 检查 JXL 与 RAW 的 Worker/WASM 没有进入 `/en/view` 初始 JavaScript，并且只在对应插件完整入口加载。

### `/{locale}/view` 统一计算环境的跨源隔离

十种合法 locale 的 `/{locale}/view` 都被识别为统一、受控的本地文件计算环境。它从页面进入时就启用跨源隔离，以支持 `libraw-wasm@1.6.0` 的 pthread 构建，并为未来 FFmpeg、推理、数据库、图像处理等 threaded WASM 留出一致的执行环境。首批发布的 `/en/view` 与 `/zh-CN/view` 必须返回隔离头；隔离不作用于首页、格式介绍页等营销页面。

`/{locale}/view` 返回：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

同时 `/vendor/libraw/:path*` 下的模块 Worker、pthread Worker 和 WASM 响应返回：

```text
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

部署层不得丢弃这些响应头。Worker 是独立执行上下文，仅给 `/{locale}/view` 加 COEP 不足以启动 LibRaw pthread。启用或调整 CSP 时还需要允许同源 Worker 和 WebAssembly；同时回归 DuckDB 的 jsDelivr 与 fallback 资源能在 COEP 下加载。

页面级隔离是当前有意选择的执行环境及其代价，不等于所有插件都必须使用多线程，也不应被表述成不可修改的永久协议。优先采用上游提供的 feature detection 和单线程 fallback；只有实测性能或功能需要时才选择 threaded bundle。若未来确实需要同时支持非隔离查看环境，再评审协议能力声明，例如 `crossOriginIsolation: "required" | "preferred" | "none"`。在宿主尚未提供多个执行环境前，不把该字段加入 v1 manifest，避免产生不能兑现的路由承诺。

普通同源 iframe 不能在非隔离顶层页面内单独成为隔离岛。若未来拆分执行环境，必须使用真正的顶层文档边界，并同时解决本地 `File` 跨导航保留和统一选择体验；当前不采用该复杂方案。

### `/{locale}/view` 的文档导航边界

COOP/COEP 在顶层文档响应时生效，客户端路由切换不会因为 pathname 变化而重新建立或撤销跨源隔离。因此：

- 从普通页面进入同语言 `/{locale}/view` 必须执行完整文档导航，不能只使用 Next.js 客户端 `<Link>`；
- 从查看页返回非隔离页面也必须执行完整文档导航；
- 查看页内部切换文件、目录和插件继续使用客户端状态，不得为此刷新页面；切换 locale 则完整导航，并清空本地文件选择；
- 发布前必须从两种语言首页实际点击进入对应查看页，断言 `crossOriginIsolated === true`，不能只测试直接访问或刷新。

站内导航统一通过 `IsolationBoundaryLink` 表达该边界：进入或离开任一合法 locale 的查看页时渲染原生 `<a>`，同一侧的普通站内导航继续使用 Next.js `<Link>`。新增导航入口不得绕过该组件。

JXL 的打包 Worker 和 WASM 位于 `/_next/static/:path*`，该路径同样返回上述 COEP/CORP 头。如果未来用 `assetPrefix` 将 Next 静态资源迁移到独立 CDN，CDN 必须保留等价响应头，否则 JXL Worker 会在加载前被浏览器拦截。

生产构建显式使用 Next.js 支持的 `next build --webpack`。`libraw-wasm` 的 Emscripten pthread runtime 在当前 Next.js 16.3.3 Turbopack 生产构建中会停留在 chunk 生成阶段。构建前将其官方 `dist` 中的入口、Worker、pthread 脚本和 WASM 原样复制到版本化同源目录，RAW 插件打开文件时才通过 URL 动态导入。生产构建使用 Webpack，开发服务仍保留 Next.js 默认的 Turbopack。

新增或升级插件不应通过提高上限来绕过失败。先检查是否误用了静态导入、顶层副作用或把实现代码放进了 manifest。

### HEIF 的同源源码构建产物

`pnpm prepare:heif` 校验 `third_party/heif-wasm/1.23.2-anyfile.1/build-info.json` 中的文件大小和 SHA-256，再把 decoder、WASM、许可证与对应源码说明复制到 `/vendor/libheif/1.23.2-anyfile.1/`。运行时 URL 与产物版本由构建门禁交叉校验。

HEIF probe 不导入这些资产。只有已识别为 HEVC 的 HEIF 在原生实际解码失败后，独立 Worker 才动态导入同源 glue 并加载 WASM。`/vendor/libheif/:path*` 返回与其他本地 Worker/WASM 一致的 COEP/CORP 头；CSP 只需允许同源 Worker 和 WebAssembly，不新增 CDN 来源。

## 6. 发布前检查清单

- 使用 `pnpm install --frozen-lockfile` 从 lockfile 安装。
- `pnpm test`、`pnpm lint`、`pnpm build` 全部通过。
- `/en/view` 与 `/zh-CN/view` 都能完成 SSG 构建；若改为 SSR，服务端日志中没有 CDN、Worker 或 WASM 初始化。
- 确认当前部署不是把“静态预渲染”误当成 `output: "export"`；如果使用静态导出，逐项验证部署服务器提供本文要求的响应头。
- 从两种语言的非隔离首页通过真实入口完整导航到对应查看页，确认 `crossOriginIsolated === true`；再完整导航离开，确认普通页面不继承查看环境。
- 候选插件的 probe 只在用户选择文件后加载，完成顺序不影响支持等级排序。
- 不带 probe 的插件不会产生额外请求，并以默认支持等级 1 排序。
- 分别打开 SQLite 和 DuckDB 文件，确认只请求对应插件资源。
- 打开包含扫描图、复合字体、ICC 配置和密码保护的 PDF，确认支持资源按需加载且密码界面可用。
- 确认密码等交互在 `open()` 返回后的插件 UI 中完成，宿主不依赖进度 `stage` 切换遮罩。
- 在正常网络下确认 DuckDB 使用带精确版本号的 jsDelivr URL。
- 阻断 `cdn.jsdelivr.net` 后确认 DuckDB 可以使用本站资源打开文件。
- 对所有外部 Worker/WASM 的最终 URL（包括重定向后 URL）检查 CORS、CORP、MIME 和不可变缓存头。
- 若启用 Cloudflare R2 fallback，确认应用域名未通过 Cloudflare 再代理到 Vercel，并确认资产域名缓存命中时不回源 Vercel。
- 部署 CSP 后，在 Chrome、Edge、Firefox 和 Safari 的目标版本验证 Worker/WASM。
