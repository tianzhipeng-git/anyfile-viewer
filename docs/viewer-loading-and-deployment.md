# 查看器加载、渲染与部署约定

本文记录查看器插件在 SSG、SSR、依赖锁定、jsDelivr 和构建体积方面的约定。修改插件注册、依赖或部署配置时，应同时检查本文列出的边界。需要从 C/C++/Rust 等上游源码自行生成 WASM、Worker 或 JavaScript glue 时，还必须遵守 [源码构建型第三方依赖规范](viewer-source-built-dependencies.md)。

## 1. SSG 与 SSR 支持

当前 `/view` 在生产构建中可以静态预渲染。以后即使页面因为读取请求数据、Cookie 等原因改为请求时 SSR，查看器架构也不需要改变。

渲染边界如下：

```text
Next.js Server Component: src/app/view/page.tsx
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

遵守这些规则时：

- SSG/SSR 只生成页面外壳，不读取用户文件。
- 构建和服务端请求不会访问 jsDelivr，也不会初始化 Worker/WASM。
- 搜索引擎可以索引静态格式页和查看页的基础内容；真实文件预览仍只在浏览器运行。

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

新增插件时必须：

1. 为 manifest 和完整实现保留不同的导出路径；需要 probe 时再增加独立 `/probe` 导出。
2. 在注册表中静态导入 manifest，通过 `import()` 动态导入 probe 和完整实现。
3. 不需要精确路由的插件省略 probe，以默认支持等级 1 参与排序。
4. 注册顺序只作为同支持等级候选的稳定 tie-break；通用兜底插件仍放在末尾。
5. 运行 `npm run build`，确认首包体积检查通过。

### PDF.js 支持资源

PDF 插件实现保持动态加载。`npm run dev` 和 `npm run build` 会先运行
`scripts/prepare-pdfjs-assets.mjs`，把已锁定版本 `pdfjs-dist` 的以下官方资源复制到
`public/vendor/pdfjs/<version>/`：

- `cmaps/`：复合字体的字符映射；
- `standard_fonts/`：PDF 标准字体的本地字体数据；
- `iccs/`：ICC 色彩配置；
- `wasm/`：JBIG2、OpenJPEG、QCMS 以及 PDF.js 官方 JavaScript 解码回退。

这些资源保持 PDF.js 发布包中的目录与文件名，浏览器只在具体 PDF 用到相应能力时按需请求。
资源与用户文件都走同源，不依赖 CDN；版本目录避免依赖升级后缓存混用。该目录是生成产物，
不提交仓库，但生产构建必须包含准备步骤。

## 3. 体积较大的WASM 的 jsDelivr 与本地回退

DuckDB JavaScript API 由应用自身打包。体积较大的 WASM 与 Worker 按以下顺序加载：

1. 使用 `getJsDelivrBundles()` 取得与已安装包版本一致的官方 jsDelivr URL。
2. 使用 `selectBundle()` 按浏览器能力选择 MVP 或 EH 版本。
3. 如果 CDN Worker 获取或 DuckDB 初始化失败，清理失败实例并使用构建产物中的同版本本地资源重试。
4. 如果本地初始化也失败，才向查看器上层返回错误。

回退只处理引擎加载/初始化失败。文件损坏、格式不支持或查询失败不会触发 CDN 到本地的重复初始化。

由于需要本地回退，部署产物仍会包含 DuckDB WASM 和 Worker。jsDelivr 减少正常流量对本站大文件分发的依赖，但不会缩小构建产物。

项目的 local-first 含义保持不变：用户选择的文件不会上传到 jsDelivr 或应用服务器。jsDelivr 只收到公共 DuckDB 引擎资源的请求。

### 部署头与网络策略

如果部署 CSP，需要至少验证以下来源：

```text
connect-src 'self' https://cdn.jsdelivr.net
worker-src 'self' blob:
```

具体 CSP 应与整站已有策略合并，并在目标浏览器上验证 Worker 和 WASM。完全离线或 CDN 被阻断时会使用本站资源，但应用自身的静态资源仍需可访问或由 Service Worker 缓存。

当前本站回退提供 MVP/EH 单线程资源。如果以后启用 COOP/COEP 和 DuckDB 多线程 COI bundle，需要同步给本地回退增加 COI WASM、主 Worker 和 pthread Worker；SSG/SSR 本身不受这一变化影响。

## 4. 依赖版本锁定

查看器的关键运行时依赖在各插件 `package.json` 中使用精确版本：

| 插件 | 关键依赖 | 版本 |
|---|---|---:|
| PDF 查看器 | `pdfjs-dist` | `6.2.108` |
| 代码查看器 | `ace-builds` | `1.44.0` |
| DuckDB 数据查看器 | `@duckdb/duckdb-wasm` | `1.32.0` |
| DuckDB 数据查看器 | `apache-arrow` | `17.0.0` |
| Word 查看器 | `docx-preview` | `0.4.0` |
| Excel 查看器 | `xlsx` | `0.20.3` |
| PowerPoint 查看器 | `@aiden0z/pptx-renderer` | `1.2.4` |
| SQLite 查看器 | `sql.js` | `1.14.2` |
| 通用栅格查看器 | `geotiff` | `3.0.5` |
| 现代栅格查看器 | `jxl-oxide-wasm` | `0.12.6` |
| HEIF 回退 | `libheif + libde265` 自建产物 | `1.23.2-anyfile.1`（`libde265 1.1.1`） |
| 相机 RAW 查看器 | `libraw-wasm` | `1.6.0` |

`package-lock.json` 使用 lockfile v3，锁定其余直接依赖和全部传递依赖的实际版本、下载地址与完整性哈希。根项目中的 `^` 版本不会在 `npm ci` 时漂移。

内部 `@anyfile/*` 依赖使用 `*`，但它们是 npm workspace 链接，解析到当前仓库目录，不会从 registry 获取任意版本。

生产环境和 CI 必须使用：

```bash
npm ci
npm test
npm run build
```

不要删除或忽略 `package-lock.json`。升级关键依赖时应明确指定目标版本，提交对应 lockfile，并重新验证插件测试、CDN URL、本地回退和生产构建。

### 源码构建型依赖

当没有满足安全、许可、CSP 或功能裁剪要求的上游包，项目可以在有明确方案评审后自行构建第三方依赖。此类依赖不进入普通 npm 构建时的 native 编译流程，而采用：

```text
tools/<dependency>-build/                 可重复构建配方
        ↓
third_party/<dependency>/<version>/       提交 Git 的审核产物
        ↓ prepare
public/vendor/<dependency>/<version>/     不提交的部署资源
```

具体进入条件、版本、升级、patch、独立仓库门槛、安全与许可证要求见 [源码构建型第三方依赖规范](viewer-source-built-dependencies.md)。能够由锁定的 npm 上游包恢复的 PDF.js、LibRaw 等现有资产继续直接从 `node_modules` 准备，不重复 vendoring。

## 5. 首包体积门禁

`npm run build` 会在 Next.js 构建后执行 `scripts/check-view-bundle.mjs`：

- 从 `/view` 的预渲染 HTML 读取真实初始脚本列表。
- 分别计算传输时的 gzip 体积。
- 当前上限为 225 KiB。
- 检查 Ace、DuckDB、SQLite、PDF、Word、Excel 和 PowerPoint 实现标记没有进入初始 JavaScript。
- 检查新增 probe 及其解析依赖没有进入初始 JavaScript；probe chunk 也不能静态带入完整插件实现。
- 检查 PDF.js Worker 已产出，且版本化 CMap、标准字体、ICC、WASM 和 JavaScript 解码回退齐全。
- 检查 JXL 与 RAW 的 Worker/WASM 没有进入 `/view` 初始 JavaScript，并且只在对应插件完整入口加载。

### 相机 RAW 的跨源隔离

`libraw-wasm@1.6.0` 的 pthread 构建要求 `crossOriginIsolated`。`/view` 返回：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

同时 `/vendor/libraw/:path*` 下的模块 Worker、pthread Worker 和 WASM 响应返回：

```text
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

部署层不得丢弃这些响应头。Worker 是独立执行上下文，仅给 `/view` 加 COEP 不足以启动 LibRaw pthread。启用或调整 CSP 时还需要允许同源 Worker 和 WebAssembly；同时回归 DuckDB 的 jsDelivr 与本地回退资源能在 COEP 下加载。

JXL 的打包 Worker 和 WASM 位于 `/_next/static/:path*`，该路径同样返回上述 COEP/CORP 头。如果未来用 `assetPrefix` 将 Next 静态资源迁移到独立 CDN，CDN 必须保留等价响应头，否则 JXL Worker 会在加载前被浏览器拦截。

生产构建显式使用 Next.js 支持的 `next build --webpack`。`libraw-wasm` 的 Emscripten pthread runtime 在当前 Next.js 16.3.3 Turbopack 生产构建中会停留在 chunk 生成阶段。构建前将其官方 `dist` 中的入口、Worker、pthread 脚本和 WASM 原样复制到版本化同源目录，RAW 插件打开文件时才通过 URL 动态导入。生产构建使用 Webpack，开发服务仍保留 Next.js 默认的 Turbopack。

新增或升级插件不应通过提高上限来绕过失败。先检查是否误用了静态导入、顶层副作用或把实现代码放进了 manifest。

### HEIF 的同源源码构建产物

`npm run prepare:heif` 校验 `third_party/heif-wasm/1.23.2-anyfile.1/build-info.json` 中的文件大小和 SHA-256，再把 decoder、WASM、许可证与对应源码说明复制到 `/vendor/libheif/1.23.2-anyfile.1/`。运行时 URL 与产物版本由构建门禁交叉校验。

HEIF probe 不导入这些资产。只有已识别为 HEVC 的 HEIF 在原生实际解码失败后，独立 Worker 才动态导入同源 glue 并加载 WASM。`/vendor/libheif/:path*` 返回与其他本地 Worker/WASM 一致的 COEP/CORP 头；CSP 只需允许同源 Worker 和 WebAssembly，不新增 CDN 来源。

## 6. 发布前检查清单

- 使用 `npm ci` 从 lockfile 安装。
- `npm test`、`npm run lint`、`npm run build` 全部通过。
- `/view` 仍能完成 SSG 构建；若改为 SSR，服务端日志中没有 CDN、Worker 或 WASM 初始化。
- 候选插件的 probe 只在用户选择文件后加载，完成顺序不影响支持等级排序。
- 不带 probe 的插件不会产生额外请求，并以默认支持等级 1 排序。
- 分别打开 SQLite 和 DuckDB 文件，确认只请求对应插件资源。
- 打开包含扫描图、复合字体、ICC 配置和密码保护的 PDF，确认支持资源按需加载且密码界面可用。
- 在正常网络下确认 DuckDB 使用带精确版本号的 jsDelivr URL。
- 阻断 `cdn.jsdelivr.net` 后确认 DuckDB 可以使用本站资源打开文件。
- 部署 CSP 后，在 Chrome、Edge、Firefox 和 Safari 的目标版本验证 Worker/WASM。
