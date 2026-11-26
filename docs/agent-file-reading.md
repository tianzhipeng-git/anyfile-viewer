# Agent 冷门文件读取方案

> 状态：架构方案，尚未实现。落地时，协议相关部分并入 [viewer-plugin-protocol.md](viewer-plugin-protocol.md)，插件级细节写入各插件 README。

本文定义将 `anyfile-viewer` 的多格式解析与渲染能力开放给 AI Agent 的整体架构，涵盖统一能力契约、插件协议扩展、Node 运行时适配、隔离模型、视觉渲染、分发缓存与仓库边界。

## 1. 目标与架构总览

目标：让各类 AI Agent（终端 Coding Agent、桌面聊天客户端、IDE Agent）快速、安全、低上下文消耗地**读懂**本地冷门与专有二进制文件（`.pst`、`.ofd`、`.h5`、`.sav`、`.dwg`、`.psd`、`.pages`、`.exr`、`.gguf` 等）。Agent 已能原生读取的 PDF、常见图片、纯文本不是重点，但仍可经同一路由处理。

产品范围变化：主站保持"只查看、不上传"；Agent 入口新增"本地只读提取为文本 / 图像"能力。落地时需同步修订协议 §1 中"不转换或导出"的表述。

整体为 **1 个 npm 包、2 个入口、2 种执行后端**：

```text
  Coding Agent (带终端)                 桌面 / IDE / 受限 Agent (无终端)
          │                                          │
          ▼                                          ▼
   anyfile <inspect|read|query|render>          anyfile mcp (stdio)
   + 内置 SKILL.md                                   │
          └────────────────────┬─────────────────────┘
                               ▼
            ┌─────────────────────────────────────┐
            │      @anyfile/agent（单一 npm 包）   │
            │ • 路径校验、Node File / Workspace 适配│
            │ • 复用 manifest + probe() 路由       │
            │ • 隔离执行池（worker_threads）       │
            │ • 解析索引缓存、响应裁剪与游标分页   │
            │ • 插件产物分发与校验                 │
            └──────────┬────────────────┬─────────┘
          结构化提取   │                │  视觉出图
                       ▼                ▼
         ┌──────────────────────┐ ┌──────────────────────────────┐
         │ 插件 ./extract        │ │ VisualRenderer               │
         │ Node worker 内运行    │ │ 纯像素插件：Node 直接编码 PNG │
         │ 纯 JS / WASM          │ │ 其余：本机 Chromium + CDP     │
         └──────────────────────┘ └──────────────────────────────┘
```

设计约束：
- **协议原生扩展**：不建平行格式注册表，路由完全复用插件 Manifest、`probe()` 与注册顺序。
- **主站零负担**：主站仍只静态导入 `/manifest`，按需加载 `/probe` 与完整插件；`./extract` 不进入任何主站 chunk。
- **本地只读**：文件内容不离开本机；提取过程禁止网络访问。

---

## 2. 统一能力契约

对外收敛为 4 个工具，不按格式拆分；CLI 子命令与 MCP 工具一一对应。

| MCP 工具 | CLI | 用途 |
|---|---|---|
| `inspect_file` | `anyfile inspect <path>` | 识别格式，返回元数据与可读目标索引 |
| `read_file` | `anyfile read <path> [--target t] [--cursor c] [--filter kw] [--max-bytes n]` | 按目标分块读取正文 |
| `query_file` | `anyfile query <path> --sql <sql> [--target t]` | 仅数据类插件（sqlite、duckdb、stat-data、excel 等）声明支持 |
| `render_file` | `anyfile render <path> [--target t] [--max-dim px] [--out file]` | 输出有界 PNG |

另有维护命令 `anyfile cache <list|add|clear>` 与 `anyfile mcp [--allow-dir <dir>...]`。

### 2.1 核心类型

```ts
interface InspectResult {
  readonly pluginId: string;
  readonly formatName: string;
  readonly supportLevel: ViewerSupportLevel;          // 来自 probe()
  readonly candidates: readonly { pluginId: string; supportLevel: ViewerSupportLevel }[];
  readonly capabilities: readonly ("read" | "query" | "render")[];
  readonly metadata: Readonly<Record<string, JsonValue>>; // 页数、尺寸、表清单、数据集树、文件夹树、归档统计…
  readonly targets: readonly TargetEntry[];             // 截断时附 targetsTruncated
  readonly targetsTruncated?: boolean;
}

interface TargetEntry {
  readonly id: string;      // 插件自定义的不透明定位键，如 "page:3"、"table:users"、"folder:Inbox/12"
  readonly title: string;
  readonly kind?: string;   // "page" | "sheet" | "table" | "dataset" | "message" | "entry" …
  readonly size?: number;   // 条目数、行数或字节数，帮助 Agent 判断读取成本
}

interface ReadParams {
  readonly target?: string;  // 省略时读取默认目标（首页、首表、摘要）
  readonly cursor?: string;  // 上次 ReadResult.nextCursor，不透明
  readonly filter?: string;  // 关键字过滤，插件不支持时忽略并在结果中标注
  readonly maxBytes: number; // 由 agent-core 传入
}

interface ReadResult {
  readonly content: string;  // Markdown / Markdown 表格 / 紧凑 JSON
  readonly contentType: "markdown" | "json" | "text";
  readonly nextCursor?: string;
  readonly truncated: boolean;
  readonly filterApplied?: boolean;
}

interface QueryParams { readonly sql: string; readonly target?: string; readonly maxBytes: number; readonly cursor?: string }
```

- 定位键语法由插件定义，Agent 只从 `targets` 复制，不自行拼接；分页只用不透明 `cursor`。
- 原始二进制字段折叠为 `<binary N bytes>`；大数组、长字符串由插件按 `maxBytes` 预裁剪，agent-core 再做兜底硬裁剪。
- 预算默认值：`inspect` ≤ 8 KiB；`read` / `query` 默认 48 KiB，可通过 `--max-bytes` / 参数调整，硬上限 256 KiB。CLI 可用 `--out` 将完整分块写到文件，避免进入上下文。
- `query_file` 只执行只读语句：SQLite 以只读方式打开，DuckDB 禁用外部访问与写入扩展；非数据插件不声明 `query` 能力。

### 2.2 Skill 与 MCP

- 包内附带 `SKILL.md`：遇到陌生或二进制文件时先 `anyfile inspect`，再按 `capabilities` 与 `targets` 调用 `read` / `query` / `render`。终端 Agent 优先走 CLI + Skill。
- MCP 面向没有终端的客户端与只允许白名单工具的环境：`render_file` 直接返回 `image` content block（`image/png`），其余工具返回文本。MCP 与 CLI 共享同一实现，不维护两套逻辑。

---

## 3. 插件协议扩展

在 [viewer-plugin-protocol.md](viewer-plugin-protocol.md) 基础上新增一项可选子路径；未实现的插件在 Agent 入口只提供 `inspect`（Manifest + probe 结果）和容器截图渲染。

### 3.1 `./extract` 子路径

插件在 `package.json` 的 `exports` 中声明 `./extract`，Manifest 不新增字段，agent 构建时按 exports 生成能力表。

```ts
export interface StructuredExtractor {
  inspect(context: ExtractContext): Promise<InspectPayload>; // InspectResult 中插件负责的部分
  read(context: ExtractContext, params: ReadParams): Promise<ReadResult>;
  query?(context: ExtractContext, params: QueryParams): Promise<ReadResult>;
  renderImage?(context: ExtractContext, params: { target?: string; maxDimension: number }): Promise<RgbaImage>;
}

export interface ExtractContext {
  readonly file: File;
  readonly workspace?: WorkspaceReader;   // 与 OpenViewerContext 同一接口，按 workspaceAccess 提供
  readonly relativePath?: string;
  readonly signal: AbortSignal;
  readonly cache: ExtractIndexCache;      // 见 §4.4
}

interface RgbaImage { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }
```

约束：
- **无 DOM、无浏览器专属 API**：不得使用 `document`、`DOMParser`、`createImageBitmap`、`OffscreenCanvas`、`ImageDecoder`、`Worker`。XML 解析统一使用共享包提供的纯 JS 解析器（§4.2）。
- **有界随机读**：`read` 只读取目标所需字节，不得在每次调用时全量扫描文件；必须全量扫描才能建立的索引交给 `cache`。
- **运行时资产**：WASM 等资产经现有 `initializeRuntimeFromSources` 加载，Node 侧新增"本地文件"来源（§4.3），不另建加载机制。
- 不发起网络请求；`renderImage` 仅限能在纯 JS/WASM 中解码像素的插件。
- 测试以 `// @vitest-environment node` 运行，使用插件 `examples/` 真实样例，校验输出结构与字节上限。

`captureImage` 不进入 `ViewerController`：浏览器渲染路径统一通过宿主截图（§5），不扩大宿主协议面。

### 3.2 解析层拆分要求

`./extract` 要求解析逻辑可在主线程同步调用，现状需要分类改造：

| 现状 | 涉及插件 | 改造 |
|---|---|---|
| 纯 JS / WASM，无浏览器 API | sqlite、excel、ml-weights、archive、plist、har、torrent、certificate、dev-*、code、hex、duckdb、calendar-contacts | 直接新增 extract |
| 依赖 `DOMParser` | chm、epub、fictionbook、iwork、mind-map、ofd、pst、visio、xps、svg、comic-book、`rendering-publication` | 解析层改用共享 XML 解析接口（浏览器注入 `DOMParser`，Node 注入纯 JS 实现） |
| 解析位于 Worker / WORKERFS 之后 | scientific-data、stat-data、mpp、mobi、dicom、visio、photoshop、djvu、postscript 等 | 把 worker 内的解析模块拆成可直接调用的函数，worker 文件只做消息转发 |
| 依赖浏览器图像解码 | browser-image、general-raster、modern-raster、photoshop、pixelmator-pxd、ofd、xps、gopro/insta360/dji 等 | 元数据走 extract；像素走 `renderImage`（有 WASM 解码器时）或浏览器渲染 |
| 主要内容依赖 DOM 渲染库 | word（docx-preview）、powerpoint、legacy-office 等 | extract 使用独立的结构解析（OOXML 本身为 ZIP + XML），不复用渲染库 |

---

## 4. Node 运行时

### 4.1 File 与 Workspace 适配

- 主文件基于 `fs.openAsBlob(path)` 包装为标准 `File`，`slice()` 惰性按区间从磁盘读取；实现时以测试确认包装为 `File` 后仍保持惰性。
- 单次整体读取沿用协议输入上限（默认 128 MiB）。
- `WorkspaceReader` 以主文件所在目录为根实现，路径经 `realpath` 校验不得越出根目录与允许目录；按插件 `workspaceAccess` 决定是否提供（OBJ+MTL、DICOM 序列、分卷压缩等）。

### 4.2 浏览器 API 替代

- **XML**：新增共享子路径导出 XML 解析接口；浏览器实现包装 `DOMParser`，Node 实现使用一个精确锁版本的纯 JS DOM 解析库。插件只依赖接口，禁止直接调用全局 `DOMParser`。
- **PNG 编码**：agent-core 内置 PNG 编码（`RgbaImage` → PNG），供 `renderImage` 使用。
- 其余插件需要的浏览器 API 不做 polyfill，对应能力走浏览器渲染后端。

### 4.3 运行时资产加载

`initializeRuntimeFromSources` 的来源列表在 Node 环境下替换为单一本地来源：从插件产物缓存目录（§6）以 `fs.readFile` 读取 `.wasm` 与数据文件，按清单中的 SHA-256 校验后传入引擎初始化，不经过 `fetch` / `WORKERFS`。

### 4.4 解析索引缓存

PST、归档、HDF5、大型 SQLite 等格式建立索引成本高，CLI 每次调用又是新进程。`ExtractIndexCache` 提供按 `(realpath, size, mtimeMs, pluginId, pluginVersion)` 键控的缓存：
- MCP 常驻进程：内存 LRU，按总字节上限淘汰。
- CLI：可选落盘到 `~/.cache/anyfile/index/`，值为插件序列化的紧凑索引；文件变化后自动失效。
- 插件只存派生索引（偏移表、目录树），不缓存文件正文。

---

## 5. 视觉渲染（VisualRenderer）

按优先级选择路径：
1. 插件实现 `renderImage`：在 Node worker 内解码像素并编码 PNG，不启动浏览器。
2. 其余插件：在本机 Chromium 中运行完整插件 `open()`，对宿主容器截图。

浏览器路径设计：
- **浏览器发现（不捆绑、不下载）**：`ANYFILE_BROWSER_PATH` → 自动探测本机 Chrome / Edge / Brave / Chromium；无可用浏览器时仅 `render` 返回明确提示。
- **驱动**：Node 24 原生 `WebSocket` 直连 `--headless=new --remote-debugging-port=0`，只使用启动、导航、事件等待、元素截图等少量 CDP 命令，不引入 Playwright / Puppeteer。
- **最小宿主页**：agent 包内置一个独立的轻量宿主页（不依赖 Next.js），加载插件浏览器 bundle、创建容器、调用 `open()`，并以"无工具栏 / 适应容器"的渲染模式请求插件隐藏交互控件。该模式作为可选宿主提示加入 `OpenViewerContext`，插件未支持时截图仍可用。
- **本地隔离服务**：仅监听 `127.0.0.1` 随机端口，带 `COOP: same-origin` / `COEP: require-corp`；插件 bundle 与 WASM 从本地缓存提供；被查看文件经一次性 Token 的 `Range` 端点提供。
- **完成判定**：等待 `reportPreview({ outcome: "success" })` 后截图，失败时返回对应错误码；不使用固定延时。`target` 通过同一宿主提示传入（如页码），插件不支持时渲染默认视图并在结果中标注。
- **资源回收**：MCP 模式懒启动并复用浏览器进程，空闲超时退出；每次请求后 `dispose()` 并关闭 Tab。
- **WebGL 风险**：无 GPU 环境依赖 SwiftShader，3D / CAD / 点云渲染可用性需按平台验证，不可用时返回明确错误。

---

## 6. 分发与缓存

1. **npm 包 `@anyfile/agent`**：包含 CLI、MCP、agent-core、全量 Manifest 路由表、PNG 编码、CDP 驱动、最小宿主页，以及**全部插件产物的版本清单（含 SHA-256）**。清单随 npm 包发布，是唯一可信来源。
2. **插件产物**：构建时为每个插件产出 `extract.mjs`（可选）、`render.mjs`（浏览器 bundle）及 `policy.json` 声明的运行时资产。体积小的 extract 产物直接打入 npm 包；超过包体预算的产物（大型 WASM、渲染 bundle）发布到 `assets.anyfile.top/agent/<pluginId>/<version>/`，对象发布后不可覆盖。
3. **按需缓存**：首次使用某插件时下载其所需产物至 `~/.cache/anyfile/plugins/<pluginId>@<version>/`（`ANYFILE_CACHE_DIR` 可覆盖），以 npm 包内清单校验 SHA-256，不匹配即拒绝执行；之后离线运行。`anyfile cache add <pluginIds...>` 用于内网预拉取。
4. 下载只请求插件产物，不携带任何文件信息。

---

## 7. 安全边界与隔离

- **严格只读**：不写目标文件；缓存只写入缓存目录。
- **路径控制**：`realpath` 校验，阻断穿越与符号链接逃逸。MCP 默认仅允许启动工作目录，`--allow-dir` 显式扩展；CLI 访问命令行给出的路径及其工作区根目录。
- **执行隔离**：每次 extract / query / 像素渲染在 `worker_threads` 中运行，设置 `resourceLimits`（堆上限）与墙钟超时（提取默认 10s、渲染默认 20s），超时直接 `terminate()`；`AbortSignal` 仅用于协作式提前结束，不作为超时手段。
- **最小权限**：worker 所在子进程以 Node 权限模型启动（`--permission`，仅 `--allow-fs-read` 目标文件、工作区根与插件缓存目录），禁止子进程、网络与写入。
- **浏览器路径**：独立临时 profile，禁用扩展与网络（仅放行本地服务）。
- **上下文预算**：所有输出经统一裁剪器限制字节与行数（§2.1）。

---

## 8. 仓库目录与门禁

```text
viewer/agent/                 # @anyfile/agent：CLI、MCP、agent-core、CDP 驱动、宿主页、SKILL.md
viewer/plugins/<id>/src/extract.ts   # 可选，package.json "./extract" 暴露
viewer/<shared>/               # 共享 XML 解析接口等以子路径导出加入现有共享包
```

- `viewer/agent` 加入 `pnpm-workspace.yaml`，不注册为插件；`check-repo` 增加：插件声明 `./extract` 时必须有 node 环境的 extract 测试；主站代码不得导入 `./extract` 与 `viewer/agent`。
- extract 测试使用 `examples/` 真实样例，校验结构、字节上限与无网络访问，纳入 `pnpm check`。
- 浏览器渲染回归测试通过环境变量开启，不进入常规 `pnpm check`。
- 产物清单生成与 SHA-256 校验并入 `pnpm build` 的资产准备流程。
