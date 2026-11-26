# Agent 冷门文件读取方案

本文定义将 `anyfile-viewer` 的多格式解析与渲染能力开放给 AI Agent 的完整架构方案，涵盖插件协议演进、统一能力契约、双执行后端、按需分发机制与仓库边界。

## 1. 目标与架构总览

目标：让各类 AI Agent（终端 Coding Agent、桌面聊天客户端、IDE Agent）能够快速、安全、低上下文消耗地**读懂**本地冷门与专有二进制文件（`.pst`、`.ofd`、`.h5`、`.sav`、`.dwg`、`.psd`、`.pages`、`.exr`、`.gguf` 等）。

整体采用 **“1 个核心引擎 + 2 种执行后端 + 2 个薄入口壳”** 的统一架构：

```text
  Coding Agent (带终端)                通用 / 桌面 / IDE Agent (无终端)
          │                                          │
          ▼                                          ▼
  ┌───────────────┐                          ┌───────────────┐
  │  @anyfile/cli │ (+ 内置 SKILL.md)        │  @anyfile/mcp │ (Stdio MCP)
  └───────┬───────┘                          └───────┬───────┘
          └────────────────────┬─────────────────────┘
                               ▼
            ┌─────────────────────────────────────┐
            │         @anyfile/agent-core         │
            │ • 路径安全校验与按需随机读 File 适配 │
            │ • 复用 manifest + probe() 格式路由   │
            │ • 插件产物按需下载与本地 SHA-256 缓存│
            │ • 响应体字节/行数裁剪与游标分页      │
            └──────────┬────────────────┬─────────┘
                       │                │
         结构化提取    │                │ 视觉出图（按需）
                       ▼                ▼
         ┌──────────────────────┐ ┌──────────────────────────────┐
         │ StructuredExtractor  │ │       VisualRenderer         │
         │ 插件 ./extract 子路径 │ │ 优先插件自吐纯净图，容器截图兜底│
         │ Node 直跑 JS / WASM  │ │ 探测本机 Chromium + 原生 CDP  │
         └──────────────────────┘ └──────────────────────────────┘
```

核心设计约束：
- **协议原生演进**：不另建与主站割裂的平行格式注册表，直接在现有插件协议上扩展可选能力，避免双轨维护腐化。
- **主站零负担**：主站继续只静态导入 `/manifest`、按需加载 `/probe` 与 `/open`，首包体积与加载边界不变。
- **轻量安装与按需拉取**：公开发布的核心包保持极小体积（仅含全量 manifest 索引与核心运行时），各插件代码与 WASM 运行时按需下载并缓存至本机。

---

## 2. 统一能力契约

对外统一收敛为 **3 个正交原语**（不按格式拆分工具），内部由 `manifest` 与 `probe()` 自动路由：

### 2.1 `inspect_file`（探测与概览）

识别文件格式并返回低 token 的结构化索引，指导 Agent 下一步按需读取。

- **输入**：`{ path: string, pluginId?: string }`
- **输出（硬上限 ≤ 8 KiB JSON）**：
  - `pluginId`、`formatName`、`supportLevel`（来自现有 `probe()`）。
  - `capabilities`：可用能力集合（`"read"`、`"render"`）。
  - `metadata`：文件大小、页数、图层数、表清单、数据集树、邮件文件夹树或归档统计。
  - `targets`：可直接传给 `read_file_part` 或 `render_file` 的定位键示例（如 `page:1`、`table:users`、`dataset:/group/temp`、`folder:Inbox`、`entry:a/b.xml`）。

### 2.2 `read_file_part`（按需切片读取）

按定位键、分页游标或关键字过滤提取结构化内容。

- **输入**：`{ path: string, target?: string, offset?: number, limit?: number, query?: string, pluginId?: string }`
- **输出（硬上限 ≤ 16 KiB）**：
  - `content`：结构化文本、Markdown 表格或紧凑 JSON。
  - `truncated`、`nextCursor` / `nextOffset`：截断时提供明确的续读参数。
  - 原始二进制字段统一折叠为 `<binary N bytes>` 摘要。

### 2.3 `render_file`（视觉出图）

为多模态 Agent 输出有界分辨率的 PNG 图像（默认最大边 `1280px`）。

- **输入**：`{ path: string, page?: number, maxDimension?: number, pluginId?: string }`
- **输出**：
  - **MCP**：返回标准 `image` content block（`image/png`）与简短元数据。
  - **CLI**：写出 PNG 至指定或临时路径，返回文件路径与尺寸。

### 2.4 CLI 与 Skill 映射

- 命令形态：
  - `anyfile inspect <path>`
  - `anyfile read <path> [--target <t>] [--offset <n>] [--limit <n>] [--query <q>]`
  - `anyfile render <path> [--page <n>] [--max-dim <px>] [--out <file>]`
  - `anyfile cache <list|add|clear>`（管理本地插件缓存与离线预拉取）
- 内置 `SKILL.md`：简短声明触发规则——遇到陌生或二进制文件时先执行 `anyfile inspect <path>`，再依据 `capabilities` 与 `targets` 调用 `read` 或 `render`。

---

## 3. 插件协议演进

在 [viewer-plugin-protocol.md](viewer-plugin-protocol.md) 基础上，为插件增加两项**可选**能力，未实现的插件自动降级。

### 3.1 新增 `./extract` 独立子路径（`StructuredExtractor`）

插件可在 `package.json` 的 `exports` 中声明 `./extract` 子路径，要求**严格无 DOM 依赖**，仅依赖标准 `File` / `Blob` / Web 标准 API 与插件自有的纯 JS/WASM 解析模块：

```ts
export interface StructuredExtractor {
  inspect(context: ExtractContext): Promise<InspectResult>;
  read(context: ExtractContext, params: ReadParams): Promise<ReadResult>;
}

export interface ExtractContext {
  readonly file: File;
  readonly signal: AbortSignal;
  /** Node 端按相对路径加载插件自带的本地 WASM/数据资产 */
  readonly loadAsset?: (relativePath: string) => Promise<Uint8Array>;
}
```

### 3.2 `ViewerController` 扩展纯净出图能力

在现有 `ViewerController` 上增加可选方法 `captureImage`，允许插件直接输出纯净内容位图（不含工具栏、侧边栏、缩放控件或滚动条，并支持指定页码/视角）：

```ts
export interface CaptureImageOptions {
  readonly page?: number;
  readonly maxDimension?: number;
  readonly signal?: AbortSignal;
}

export interface ViewerController {
  dispose(): void | Promise<void>;
  captureImage?(options?: CaptureImageOptions): Promise<Blob>;
}
```

- **Canvas / WebGL / 像素解码类插件**（`ofd`、`xps`、`pdf`、`photoshop`、`hdr-image`、`general-raster`、`dicom`、`cad-dwg`、`mesh-3d` 等）：直接由画布或像素缓冲区导出 PNG/WebP `Blob`。
- **纯像素解码类插件**：在 `./extract` 或纯 Node 路径下可直接把解码后的 RGBA 编码为 PNG，无需启动浏览器。
- **复杂 DOM 类或未实现 `captureImage` 的插件**：由 `VisualRenderer` 对查看器容器执行元素截图兜底。

---

## 4. 双执行后端设计

### 4.1 Node 端文件适配（按需随机读）

插件协议统一接收标准 `File`（依赖 `file.size`、`file.slice(start, end).arrayBuffer()` / `stream()`）。Node 端不将大文件一次性读入内存，而是基于 `fs.openAsBlob(path)` 或 `fs.promises.FileHandle` 包装为符合标准 `File` 接口的对象：

- `slice(start, end)` 仅记录区间偏移，读取时按区间从磁盘读出对应字节；
- 沿用协议单次读取上限（默认 128 MiB），调用结束后显式关闭句柄；
- 仅在 Node 运行时使用，使现有 `probe()` 与纯 JS 解析器无需修改 IO 逻辑即可直接复用。

### 4.2 `StructuredExtractor` 覆盖范围与 WASM 加载

- **优先覆盖领域**：
  - 文档与办公：`pst`、`ofd`、`xps`、`iwork`、`legacy-office`、`word`、`excel`、`powerpoint`、`mind-map`、`calendar-contacts`、`mpp`
  - 出版物：`epub`、`mobi`、`chm`、`fictionbook`、`pdf`
  - 数据与科学计算：`scientific-data`（NetCDF / MATLAB / HDF5）、`stat-data`（`.sav`/`.dta`/`.sas7bdat`）、`sqlite`、`duckdb`
  - 开发者与容器：`plist`、`archive`、`ml-weights`、`dev-array`、`dev-wasm`、`dev-native-binary`、`dev-source-map`、`har`、`torrent`、`certificate`、`code`、`hex`
  - 图像元数据：`dicom`（Tag 元数据）、`photoshop`（图层树与尺寸）
- **Node 端 WASM 加载**：通过 `ExtractContext.loadAsset` 直接从本地缓存目录 `fs.readFile` 读取 `.wasm` 二进制并传入引擎初始化，绕过浏览器 `fetch` / `WORKERFS`。

### 4.3 `VisualRenderer` 设计（零 Playwright，探测系统浏览器）

覆盖所有图形、CAD、3D、专业图像、版式及重型浏览器 WASM 格式（`cad-dwg`、`cad-2d`、`cad-exchange`、`ifc`、`mesh-3d`、`print-3d`、`point-cloud`、`visio`、`photoshop`、`pixelmator-pxd`、`hdr-image`、`camera-raw`、`djvu`、`postscript`、`comic-book`、`font` 等）。

- **浏览器发现（不捆绑、不自动下载浏览器）**：
  1. 优先读取环境变量 `ANYFILE_BROWSER_PATH`；
  2. 自动探测本机已安装的 Chromium 系浏览器（macOS：Chrome / Edge / Brave / Arc / Chromium；Linux：`google-chrome` / `chromium` / `microsoft-edge`；Windows：Chrome / Edge）；
  3. 本机无可用浏览器时正常启动，仅在调用需要浏览器的 `render_file` 时返回明确提示。
- **原生 CDP 通信**：利用 Node 24 原生 `WebSocket` 直接与 `--headless=new --remote-debugging-port=0` 进程通信（无 Playwright 依赖）。
- **本地隔离静态服务**：仅监听 `127.0.0.1` 随机端口，提供 `COOP: same-origin` 与 `COEP: require-corp` 响应头，直接分发本地缓存的插件渲染 bundle 与 WASM 资产（零外网依赖），并通过带一次性 Token 的 `Range` 端点向页面提供本地文件。
- **确定性同步与实例回收**：
  - 等待插件发出 `reportPreview({ outcome: "success" })` 后调用 `controller.captureImage()`（未实现时回退容器截图），不使用固定延时；
  - MCP 常驻模式下懒启动并复用浏览器进程（空闲超时自动退出），每次请求结束后调用 `controller.dispose()` 并销毁 Tab 释放 WASM/WebGL 内存。

---

## 5. 按需分发与本地缓存机制

公开发布时避免一次性安装全部插件及数百 MiB 运行时资产，沿用 [viewer-loading-and-deployment.md](viewer-loading-and-deployment.md) 的版本化静态分发与校验体系：

1. **轻量核心包（npm 发布）**：
   - `@anyfile/cli` 与 `@anyfile/mcp` 体积控制在 2 MiB 以内；
   - 仅内嵌全量插件的纯数据 `manifest` 索引、格式路由、本地缓存管理、CDP 桥接与 CLI/MCP 壳代码。
2. **自包含插件产物（静态 CDN 分发）**：
   - 构建时将每个插件预打包为自包含产物：
     - `extract.mjs`（Node 端结构化提取 bundle，可选）
     - `render.mjs`（浏览器端渲染 bundle）
     - 插件对应的 `.wasm` 与运行时资产（复用 `policy.json` 清单）
   - 随版本发布到 `assets.anyfile.top`（R2 + CDN）并生成带 SHA-256 的版本清单 `registry.json`。
3. **首次使用按需缓存**：
   - 缓存根目录：`~/.cache/anyfile/plugins/<pluginId>@<version>/`（可通过 `ANYFILE_CACHE_DIR` 覆盖）；
   - 首次命中某插件时仅下载该插件所需产物，校验 SHA-256 后落盘，后续完全离线运行；
   - 支持 `anyfile cache add <pluginIds...>` 供内网或离线环境预拉取。

---

## 6. 安全边界与上下文控制

- **严格只读**：所有工具与命令均不修改或写入目标文件。
- **目录访问控制**：解析路径时执行 `fs.realpath` 校验，阻断路径穿越与符号链接逃逸；MCP Server 默认仅允许访问启动工作目录，通过 `--allow-dir <dir>` 显式扩展白名单。
- **超时与取消**：所有操作传递 `AbortSignal` 并设硬超时（结构化提取默认 10s，视觉渲染默认 20s）。
- **上下文硬预算**：响应经统一裁剪器强制限制字节数与行数，禁止将未截断大数组或原始二进制直接输出到文本响应中。

---

## 7. 仓库目录与门禁规划

```text
packages/
├── agent-core/          # @anyfile/agent-core：Node File 适配、路由、裁剪、缓存管理、原生 CDP 渲染池
├── agent-cli/           # @anyfile/cli：inspect / read / render / cache 命令与内置 SKILL.md
└── agent-mcp/           # @anyfile/mcp：Stdio MCP Server（薄封装 @anyfile/agent-core）

viewer/plugins/<id>/
└── src/extract.ts       # 可选，导出 StructuredExtractor，通过 package.json "./extract" 暴露
```

- **门禁与测试**：
  - 复用各插件 `examples/` 下的真实样例对 `extract.ts` 跑无网单元测试，校验输出结构与字节上限；
  - 视觉渲染回归测试通过环境变量按需开启，不拖慢常规 `pnpm check`；
  - 保持所有源码文件符合仓库行数限制，不向主站页面引入任何 Node 侧依赖。
