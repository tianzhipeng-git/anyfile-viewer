# Agent 冷门文件读取方案 & V0.2.0版本规划

> 状态：架构方案，尚未实现。落地时，协议部分并入 [viewer-plugin-protocol.md](viewer-plugin-protocol.md)，加载与资产约定并入 [viewer-loading-and-deployment.md](viewer-loading-and-deployment.md)，插件开发边界并入 [plugin-development.md](plugin-development.md)，插件级细节写入各插件 README。

本文定义将 `anyfile-viewer` 的多格式解析与渲染能力开放给 AI Agent 的整体架构，涵盖能力契约、双端统一插件边界、统一文件 I/O、Node 执行池、视觉渲染宿主、共享资产分发与仓库门禁。

## 1. 目标与架构总览

目标：让各类 AI Agent（终端 Coding Agent、桌面聊天客户端、IDE Agent）快速、安全、低上下文消耗地**读懂**本地冷门与专有二进制文件。Agent 已能原生读取的常见文本、图片和常规文档仍可经同一路由处理。

产品范围变化：Web 主站保持“只查看、不上传”；Agent 宿主新增“本地只读提取为结构化文本 / 有界 PNG”能力。落地时同步修订协议 §1 中“不转换或导出”的表述。

整体为 **1 个公开 npm 包、2 个入口、2 种执行后端**：

```text
  Coding Agent (带终端)                 桌面 / IDE / 受限 Agent (无终端)
          │                                          │
          ▼                                          ▼
   anyfile <inspect|read|query|render>          anyfile mcp (stdio)
   + 内置 SKILL.md                                   │
          └────────────────────┬─────────────────────┘
                               ▼
            ┌──────────────────────────────────────────┐
            │        @anyfile/agent（单一 npm 包）      │
            │ • realpath 权限校验、BinarySource 适配   │
            │ • 共享路由注册表 + Magic Bytes 兜底探测   │
            │ • worker_threads 执行池（路由与提取均在内）│
            │ • 响应预算裁剪、不透明游标与错误码映射    │
            │ • /vendor/ 资产按需拉取与 SHA-256 校验    │
            └──────────┬───────────────────┬───────────┘
          结构化提取   │                   │  视觉出图
                       ▼                   ▼
         ┌──────────────────────┐ ┌─────────────────────────────────┐
         │ 插件 ./extract        │ │ VisualRenderer                  │
         │ Node worker 内运行    │ │ 纯像素插件：Node 直接编码 PNG    │
         │ 纯 JS / WASM / 内置库 │ │ 其余：本机 Chromium + CDP        │
         └──────────────────────┘ │   + 单一 Vite renderer-host     │
                                  └─────────────────────────────────┘
```

核心架构约束：
- **共享引擎 + 双宿主平级消费**：仓库由“共享多格式引擎（`@anyfile/viewer-registry`、`viewer/plugins/*`、`viewer/*`、`tools/`、`third_party/`、R2 `/vendor/` 资产）”与两个互不依赖的宿主组成——Web 宿主（`src/`）与 Agent 宿主（`viewer/agent/`）。
- **主站零负担**：Web 主站仍只静态导入 `/manifest`，按需动态加载 `/probe` 与浏览器入口；`./extract` 与 Node 侧实现不进入任何主站 chunk。
- **本地只读**：用户文件内容不离开本机；解析与浏览器渲染过程禁止访问公网。

---

## 2. 统一能力契约

对外收敛为 4 个业务工具，不按文件格式拆分；CLI 子命令与 MCP 工具一一对应，共享同一套核心实现。

| MCP 工具 | CLI | 用途 |
|---|---|---|
| `inspect_file` | `anyfile inspect <path>` | 识别格式，返回元数据、支持能力与可读目标索引 |
| `read_file` | `anyfile read <path> [--target t] [--cursor c] [--filter kw] [--max-bytes n] [--out file]` | 按目标分块读取结构化正文 |
| `query_file` | `anyfile query <path> --sql <sql> [--target t] [--cursor c] [--max-bytes n] [--out file]` | 仅具备 SQL 引擎的插件（`sqlite`、`duckdb`）声明支持；其余表格/数组切片走 `read_file` |
| `render_file` | `anyfile render <path> [--target t] [--max-dim px] [--out file]` | 输出有界 PNG |

另有维护与服务子命令：`anyfile cache <list|add|clear>` 与 `anyfile mcp [--allow-dir <dir>...]`。

### 2.1 数据结构与错误契约

```ts
interface InspectResult {
  readonly pluginId: string;
  readonly formatName: string;
  readonly supportLevel: ViewerSupportLevel;
  readonly matchedBy: "extension" | "magic";
  readonly candidates: readonly { pluginId: string; supportLevel: ViewerSupportLevel }[];
  readonly capabilities: readonly ("read" | "query" | "render")[];
  readonly metadata: Readonly<Record<string, JsonValue>>; // 页数、尺寸、表清单、数据集树、文件夹树、归档统计…
  readonly targets: readonly TargetEntry[];
  readonly targetsTruncated?: boolean;
}

interface TargetEntry {
  readonly id: string;      // 插件定义的不透明定位键，如 "page:3"、"table:users"、"folder:Inbox/12"
  readonly title: string;
  readonly kind?: string;   // "page" | "sheet" | "table" | "dataset" | "message" | "entry" …
  readonly size?: number;   // 条目数、行数或字节数，供 Agent 评估读取成本
}

interface ReadParams {
  readonly target?: string;  // 省略时读取默认目标（首页、首表、摘要）
  readonly cursor?: string;  // 上次 ReadResult.nextCursor，不透明
  readonly filter?: string;  // 关键字过滤；插件不支持时忽略并在结果中置 filterApplied: false
  readonly maxBytes: number;
}

interface ReadResult {
  readonly content: string;  // Markdown / Markdown 表格 / 紧凑 JSON
  readonly contentType: "markdown" | "json" | "text";
  readonly nextCursor?: string;
  readonly truncated: boolean;
  readonly filterApplied?: boolean;
}

interface QueryParams {
  readonly sql: string;
  readonly target?: string;
  readonly cursor?: string;
  readonly maxBytes: number;
}

type AgentErrorCode =
  | "invalid-argument"        // 调用参数错误（缺路径、缺 SQL、SQL 语法错误、未知命令）
  | "invalid-file"            // 文件损坏或并非该格式
  | "encrypted-file"          // 受密码或加密保护，无法无交互读取
  | "missing-related-file"    // 缺少必需的关联工作区文件
  | "target-not-found"        // 指定的 target 或 cursor 无效
  | "unsupported-capability"  // 当前插件不支持 read / query / render 该操作
  | "runtime-unavailable"     // WASM 资产缺失/校验失败，或 render 缺少可用浏览器/WebGL
  | "resource-limit"          // 超出文件、内存或解压安全上限
  | "timeout"                 // 超出单次执行墙钟时间上限
  | "access-denied";          // 路径不存在或越出允许目录

interface AgentFileError {
  readonly code: AgentErrorCode;
  readonly message: string;   // 稳定英文诊断，不含敏感正文或解析器堆栈
  readonly pluginId?: string;
}
```

输出与安全约束：
- 定位键语法由各插件私有定义，Agent 只从 `targets` 复制 `id`，不自行拼接；翻页只传递不透明 `cursor`。
- 分页统一用 `@anyfile/viewer-protocol` 的 `renderMarkdownTablePage` / `paginateLines` / `paginateText`：表格 cursor 计数源行（被 `filter` 滤掉的行同样推进游标），超出预算的单行会被截断而不是卡住；合规套件会把整条 cursor 链走完，校验能终止且不重复。
- 原始二进制字段统一折叠为 `<binary N bytes>`；大数组、长字符串先由插件按 `maxBytes` 预裁剪，再由 `agent-core` 做兜底字节与行数硬裁剪。
- 默认预算：`inspect` ≤ 8 KiB；`read` / `query` 默认 48 KiB，支持参数调整，硬上限 256 KiB。CLI 指定 `--out <file>` 时将完整分块直接写入目标文件，终端仅打印摘要元数据。
- `query_file` 强制只读：SQLite 以只读模式打开并拒绝写语句与扩展加载；DuckDB 以 `READ_ONLY` 打开并禁用外部文件/网络访问。

### 2.2 Skill 与 MCP 分工

- 包内附带 `SKILL.md`：指导终端 Coding Agent 遇到陌生或专有二进制文件时先执行 `anyfile inspect`，再按 `capabilities` 与 `targets` 调用 `read` / `query` / `render`。
- MCP 服务面向无终端客户端：`render_file` 直接返回 MCP `image` content block（`image/png`），其余工具返回文本；失败时统一返回带 `AgentErrorCode` 的结构化错误，防止 Agent 盲目重试。

---

## 3. 共享路由与双端统一插件边界

### 3.1 共享路由注册表与 Magic Bytes 兜底

1. **下沉共享注册表（`@anyfile/viewer-registry`）**：将插件路由优先级顺序、`manifest` 与动态 `./probe` 引用从 `src/lib/registrations/` 抽离至独立共享包 `@anyfile/viewer-registry`（不含浏览器 `load()`）。Web 宿主在此基础上绑定浏览器 `load()`，Agent 宿主绑定 `./extract` 与渲染器，消除双宿主间的平行注册表。
2. **Probe 纯净化**：所有插件的 `probe.ts` 仅做基于文件头/目录结构的格式识别与子格式判定，不检测 `VideoDecoder`、`AudioContext`、`Worker` 等浏览器专属全局对象。需要按浏览器能力让路的插件（如 `non-native-video/audio` 缺 WebCodecs 时让给 FFmpeg）额外导出 `./browser-probe`，在注册表条目上挂为 `browserProbe`；Web 宿主优先使用它，Agent 宿主只用 `probe`。
3. **无后缀与错后缀兜底**：双端共用 `resolveViewerRegistrations()`；Agent 传 `magicFallback: true`。若文件名只匹配到兜底查看器（如 hex），再对其余带 `probe` 的插件探测一轮，且只认真正读取了字节的 probe，命中项排在前面并标记 `matchedBy: "magic"`（常见于解包产物、`.bin`/`.dat`、Git blob、临时文件）。

### 3.2 双端统一 I/O 与环境适配接口

为让插件作者**核心解析逻辑只写一遍即可同时对接 Web 与 Agent**，在共享包中提供以下标准基础设施：

#### 统一随机读数据源 `BinarySource`

浏览器主线程与 Node 都支持异步切片读取，而 C/C++/Rust 编译的 WASM 引擎在底层 POSIX `pread` 中需要后台线程内的**同步随机读**（Web Worker 内基于 `FileReaderSync`，Node `worker_threads` 内基于 `fs.readSync`）。通过 `@anyfile/viewer-protocol` 统一暴露 `BinarySource`，屏蔽双端底层差异：

```ts
export interface BinarySource {
  readonly name: string;
  readonly size: number;

  /** 异步区间读取：供纯 JS/TS 解析器在任意线程使用 */
  read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array>;

  /** 同步区间读取：在 Web Worker 与 Node worker_threads 内可用，直接对接 C/WASM 同步读取回调 */
  readSync(offset: number, target: Uint8Array): number;

  /** Emscripten FS 只读挂载：Web Worker 内挂载 WORKERFS，Node worker 内挂载只读节点/设备 */
  mountEmscripten?(FS: EmscriptenFS, mountDir: string): { readonly filePath: string; unmount(): void };
}
```

- 纯 JS/TS 插件：解析模块接收 `BinarySource`，仅调用 `await source.read(offset, length, signal)`，Web `open()` 与 Agent `./extract` 直接复用同一解析模块。
- C/WASM 插件：核心引擎模块只依赖 `source.readSync` 或 `source.mountEmscripten`；Agent `./extract` 在 `worker_threads` 内直接调用核心引擎，Web 侧仅保留极薄的 Web Worker 消息转发壳。
- SDK 内部自管 Worker 与协议的少量例外（如 `@duckdb/duckdb-wasm`）：通过子模块 `"browser"` / `"node"` 条件导出隔离约二十行的会话创建逻辑，上层 Schema 发现、查询与值格式化完全共用；`sqlite` 的 `./extract` 直接使用 Node 24 内置 `node:sqlite`（`readOnly: true`）按页随机读取，无需整库载入内存。

#### 统一 XML 解析与运行时动态导入

- **XML 解析接口**：共享包通过 `package.json` 的 `"browser"` / `"node"` 条件导出提供统一只读 XML DOM 接口；浏览器侧封装原生 `DOMParser`，Node 侧使用 happy-dom（与仓库测试环境同一实现、锁定精确版本），保证命名空间、`parsererror`、`.children` 与选择器行为一致。已知缺口：带前缀元素的 `getElementsByTagNameNS` 不可靠，应改按 `localName` + `namespaceURI` 遍历。插件解析层只依赖该接口，不直接访问全局 `DOMParser`。
- **运行时加载辅助 `importRuntime(url)`**：在 `@anyfile/runtime-assets` 中统一封装动态 URL `import()`（集中处理 `webpackIgnore`、`turbopackIgnore` 与 `@vite-ignore`），插件源码内不再手写任何打包器专用注释。

### 3.3 插件四层入口与 `./extract` 契约

每个插件遵循四层入口边界：

| 入口 | 运行环境 | 职责与红线 |
|---|---|---|
| `manifest.ts`（`./manifest`） | Web / Node 共用 | 纯静态元数据声明，零运行时依赖 |
| `probe.ts`（`./probe`） | Web / Node 共用 | 有界读头识别格式支持等级，严禁访问浏览器专属全局或初始化重型引擎 |
| `extract.ts`（`./extract`，可选） | Node（`worker_threads`） | 结构化提取与纯像素解码；严禁 DOM/Web Worker，统一经 `BinarySource`、共享 XML 接口与本地 `/vendor/` 资产运行 |
| `index.ts`（默认入口 `.`） | 浏览器 | DOM/Canvas/WebGL 交互查看与 `open()`（可选实现 `captureImage()`），严禁导入 Node API |

`./extract` 在插件 `package.json` 的 `exports` 中声明，类型契约如下：

```ts
export interface StructuredExtractor {
  inspect(context: ExtractContext): Promise<InspectPayload>;
  read(context: ExtractContext, params: ReadParams): Promise<ReadResult>;
  query?(context: ExtractContext, params: QueryParams): Promise<ReadResult>;
  renderImage?(context: ExtractContext, params: { target?: string; maxDimension: number }): Promise<RgbaImage>;
}

export interface ExtractContext {
  readonly source: BinarySource;
  readonly file: File;
  readonly vendor: VendorAssets;          // 按 `<pkg>/<version>/<file>` 取 /vendor/ 资产：url()（可 importRuntime）与 bytes()
  readonly workspace?: WorkspaceReader;   // 与 OpenViewerContext 同一接口；主文件目录在允许根内时提供
  readonly relativePath?: string;
  readonly signal: AbortSignal;
}

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}
```

覆盖原则：除常规复杂流式/重排版 Office 文档（`word`、`powerpoint`、`legacy-office`，此类格式生态已有成熟工具且重写完整版式结构提取性价比极低，在 Agent 侧仅提供基础 probe 与浏览器 `render_file` 截图兜底）及纯音视频播放外，其余具备有意义文本、表格、树形结构、元数据或可解码像素的插件均提供 `./extract`。

### 3.4 `ViewerController.captureImage`（可选）

在浏览器 `ViewerController` 上新增可选方法 `captureImage`，供视觉渲染宿主输出不含外围工具栏/侧边栏的纯净内容图，并支持单次 `open()` 后按 `target` 切页或切换视图连续出图：

```ts
export interface CaptureImageOptions {
  readonly target?: string;
  readonly maxDimension: number;
  readonly signal?: AbortSignal;
}

export interface ViewerController {
  dispose(): void | Promise<void>;
  captureImage?(options: CaptureImageOptions): Promise<Blob>;
}
```

---

## 4. Node 运行时与执行池

### 4.1 文件、工作区与资产加载

- **文件与工作区**：主线程只做 `realpath` 白名单校验；路由（probe）与提取都在 worker 内执行，受同一内存上限与超时约束。worker 内用 `fs.openAsBlob()` 构造真正的惰性 `File`，并为每次请求打开只读 fd 构造 `BinarySource`，用完即关。`WorkspaceReader` 以主文件所在目录为根，且仅在该目录本身位于允许根内时提供，严格拦截路径穿越与越界符号链接。
- **Node 侧 `/vendor/` 资产加载**：`@anyfile/runtime-assets/node` 的 `createNodeVendorAssets()` 依次在本地缓存 `~/.cache/anyfile/vendor/`（`ANYFILE_CACHE_DIR` 可覆盖）以及仓库内的 `public/vendor/`、`third_party/`（目录结构相同，仅开发态存在）中查找；清单中登记的资产先做 SHA-256 校验，全程不发起网络请求。插件 `./extract` 统一通过 `context.vendor` 取资产，`stat-data`（ReadStat）是 WASM 样板。

### 4.2 Worker 执行池

所有 `./extract` 调用在受控 `worker_threads` 中执行，配置 `resourceLimits`（堆内存上限）与单次调用墙钟超时（`inspect`/`read`/`query` 默认 10s，`renderImage` 默认 20s）；超时直接 `worker.terminate()` 并返回 `timeout` 错误码，`AbortSignal` 仅作协作式提前取消。

- **MCP 常驻模式**：Worker 常驻复用（空闲超时回收），已加载的 extractor 模块与 WASM 实例（如 ReadStat）留在 Worker 内。每次请求重新打开文件，不缓存解析会话；需要缓存时，应由 extractor 在 Worker 内自行维护以 `(realpath, size, mtimeMs)` 为键的状态。超时只会杀掉对应的 Worker，不影响随后在新 Worker 上发起的请求。
- **CLI 单次模式**：单次命令执行完毕即退出释放，不向磁盘写入任何文件索引缓存，彻底避免文件名、表名、邮件目录等敏感元数据落盘残留。

---

## 5. 视觉渲染（VisualRenderer）

`render_file` 按以下优先级生成有界 PNG（最大边长默认 `1600px`，硬上限 `4096px`）：

1. **Node 纯像素路径（优先）**：若插件在 `./extract` 中实现了 `renderImage`（如 PSD、HDR/EXR、DICOM、HEIC、相机 RAW 等具备 JS/WASM 像素解码器的插件），直接在 Node worker 内解码 `RgbaImage` 并编码为 PNG，不启动浏览器。
2. **本机 Chromium + 单一 Vite 渲染宿主路径**：其余视觉格式（如 CAD/DWG、3D/STEP/IFC、OFD、XPS、PostScript、DjVu、复杂排版文档等）通过本机 Chromium 运行完整浏览器插件出图。

### 5.1 单一极简 Vite 渲染宿主（`viewer/agent/renderer-host/`）

不为每个插件单独维护浏览器打包器，而是在 `viewer/agent/renderer-host/` 下维护一个约百行的纯静态 Vite 应用：
- 构建阶段根据 `@anyfile/viewer-registry` 自动生成静态懒加载映射表 `Record<pluginId, () => Promise<FileViewerPlugin>>`，仅执行一次标准 `vite build` 即可利用 Vite 原生代码分割产出全部插件与业务 Web Worker 的按需 chunk。
- 宿主页提供与主站查看容器一致的基础尺寸约束与 CSS 变量，接收渲染参数后动态加载目标插件并调用 `open()`。

### 5.2 CDP 驱动与本地离线服务

- **浏览器发现（不捆绑、不自动下载浏览器）**：优先读取 `ANYFILE_BROWSER_PATH`（`ANYFILE_BROWSER_ARGS` 追加额外启动参数，如系统禁用沙箱时的 `--no-sandbox`），否则自动探测本机已安装的 Chrome / Edge / Brave / Chromium；未找到时仅 `render_file` 返回 `runtime-unavailable` 及明确指引，不影响其余工具。
- **零重型依赖驱动**：使用 Node 24 原生 `WebSocket` 直连 `--headless=new --remote-debugging-port=0`，仅调用页面导航、生命周期等待与截图等少量 CDP 命令，不引入 Playwright 或 Puppeteer 运行时依赖。
- **本地 `127.0.0.1` 隔离服务与 `/vendor/` 透明缓存映射**：
  - 仅绑定 `127.0.0.1` 随机端口，响应头附带 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`。
  - 提供 `renderer-host` 静态资源，并通过一次性随机 Token 的只读 `Range` 端点暴露目标文件与授权工作区关联文件。
  - 宿主页注入本地同源优先标记，使 `@anyfile/runtime-assets` 直接请求同源 `/vendor/<pkg>/<version>/*`（跳过公网 CDN 源）；本地服务拦截 `/vendor/*` 请求并透明映射至 `~/.cache/anyfile/vendor/`——未命中缓存时由 Node 主进程按清单从 `https://assets.anyfile.top/vendor/` 下载并校验 SHA-256 后落盘返回，Chromium 进程本身完全禁网（仅放行 `127.0.0.1`）。
- **完成判定与出图**：等待插件触发 `reportPreview({ outcome: "success" })`（或 `failure` 映射为对应错误码），优先调用 `controller.captureImage({ target, maxDimension })`；未实现时对挂载容器执行 CDP 节点截图（若传入了非默认 `target` 则在返回元数据中标注未支持目标切页）。
- **进程复用与 WebGL 兜底**：MCP 模式下懒启动并复用单个无头浏览器进程，每次请求创建独立上下文/Tab 并在 `dispose()` 后关闭，空闲超时退出整个浏览器；无硬件 GPU 环境依赖 SwiftShader，WebGL 不可用时返回明确的 `runtime-unavailable`。

---

## 6. 构建、分发与共享资产缓存

1. **单一 npm 包 `@anyfile/agent`**：
   - 仓库内 `@anyfile/*` 均为未独立发布的 `workspace:*` TypeScript 源码包。构建 `@anyfile/agent` 时，将 CLI、MCP、`agent-core`、共享包、全部插件的 `./manifest` + `./probe` + `./extract`（编译为按插件切分的自包含 ESM chunk）、`renderer-host` 静态构建产物（纯 JS/CSS chunk）、`SKILL.md` 以及**全量 `/vendor/` 资产 SHA-256 清单**一并打包发布。
   - 严禁插件通过 `new URL("*.wasm", import.meta.url)` 让 bundler 将大型 WASM 静态内联进 JS 构建产物；所有重型 WASM/glue 统一走 `/vendor/<pkg>/<version>/...`。
2. **Web 与 Agent 共用 R2 `/vendor/` 制品库**：
   - 不建立平行的 Agent 专属远端资产目录，双端统一复用 `https://assets.anyfile.top/vendor/<pkg>/<version>/<file>`（Web 侧原本仅同源分发的少量中小型自建/第三方 WASM 如 `h5wasm`、`readstat`、`mppgo` 等同步补传至同一 `vendor/` 命名空间，保持不可变版本路径）。
3. **按需本地缓存与离线预热**：
   - 首次调用依赖某 `/vendor/` 资产的插件时，Node 主进程按内置清单从 `https://assets.anyfile.top/vendor/` 下载对应文件至 `~/.cache/anyfile/vendor/<pkg>/<version>/`（可通过 `ANYFILE_CACHE_DIR` 覆盖），严格校验 SHA-256 通过后方可使用，此后完全离线运行。
   - 下载请求仅拉取固定版本的公共运行时资产，不携带任何用户文件名、扩展名或内容特征。
   - 内网或纯离线环境可通过 `anyfile cache add <pluginIds...|all>` 预先拉取并校验所需资产。

---

## 7. 安全边界

- **严格只读**：所有文件描述符均以只读标志打开；除用户显式指定的 CLI `--out` 输出路径与 `~/.cache/anyfile/vendor/` 资产缓存目录外，不写入任何本地文件。
- **路径边界控制**：所有路径在主线程先经 `realpath` 规范化并校验白名单，阻断 `..` 穿越与符号链接逃逸。MCP 默认仅允许访问启动时的工作目录（通过 `--allow-dir` 显式追加）；CLI 仅允许访问命令行显式传入的文件路径及其所属工作区根目录。
- **资源与超时隔离**：Node 提取与纯像素渲染运行于带堆上限与强超时的 `worker_threads`；Chromium 运行于独立临时 Profile，禁用浏览器扩展、后台联网与外部域名请求（仅允许连接本机 `127.0.0.1` 隔离服务）。
- **上下文防爆**：所有文本与 JSON 响应强制经过统一字节与行数裁剪器后再返回给 Agent。

---

## 8. 仓库目录与门禁

```text
viewer/registry/                      # @anyfile/viewer-registry：双端共享的纯路由顺序与 manifest + probe 表
viewer/agent/                         # @anyfile/agent：CLI、MCP、agent-core、CDP 驱动、SKILL.md
viewer/agent/renderer-host/           # 单一极简 Vite 视觉渲染宿主页
viewer/plugins/<id>/src/extract.ts    # 可选结构化提取入口，由 package.json "./extract" 暴露
```

门禁与测试约束：
- `viewer/registry` 与 `viewer/agent` 加入 `pnpm-workspace.yaml`，不作为查看器插件注册。
- `scripts/check-repo.mjs` 与 `scripts/check-view-bundle.mjs` 强制执行边界检查：
  - **双宿主隔离**：`src/` 严禁导入 `viewer/agent`、任何插件的 `./extract` 及 Node 侧 XML 解析实现；`viewer/agent` 严禁依赖 `src/` 或 Next.js；双端路由一致性由共享 `@anyfile/viewer-registry` 保证。
  - **Probe 纯净度**：`viewer/plugins/*/src/probe.ts` 严禁引用浏览器专属全局 API。
  - **打包整洁度**：禁止在 `@anyfile/runtime-assets` 之外手写 bundler ignore 魔法注释；禁止在插件源码中通过 `new URL("*.wasm", import.meta.url)` 将大型二进制静态打包进 chunk。
  - **Extract 测试覆盖**：凡在 `package.json` 导出 `./extract` 的插件，必须包含 `// @vitest-environment node` 测试文件，基于插件 `examples/` 真实样例验证 `inspect` / `read`（及可选 `query` / `renderImage`）输出结构、字节裁剪上限与零网络请求，纳入 `pnpm check`。
- 真实 Chromium 视觉渲染集成测试通过环境变量显式开启，不阻塞常规无头 `pnpm check`。
- `/vendor/` 资产 SHA-256 清单生成与完整性校验并入 `pnpm build` 的资产准备与检查流程。
