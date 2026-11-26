# Agent 冷门文件读取方案（V0.2.0）开发计划

> 架构设计见 [agent-file-reading.md](agent-file-reading.md)。本文档面向 Coding Agent 执行编排，落地完成后随方案文档一并合流归档。

## 执行铁律

1. **门禁与测试先行（Red → Green）**：每个里程碑必须先新增或收紧门禁/测试并执行确认红灯（验证规则确实检出现有问题），再大刀阔斧修改实现直至全绿。
2. **一步到位，不留兼容层**：在 `dev` 分支上直接重构签名与目录结构，不保留新旧并存的过渡胶水；冲刺期不做主站逐次人工 UI 回归，但合并回 `dev` 时必须保证 `pnpm check`（及涉及构建/资产时的 `pnpm build`）全绿，确保后续 Agent 拥有确定的基线。
3. **消除并发写冲突**：`@anyfile/agent` 的 `./extract` 与 `renderer-host` 插件映射必须由构建/脚本自动扫描 `viewer/plugins/*/package.json` 生成，禁止在多 Agent 并行阶段手工维护中央总表。
4. **明确止损条件**：遇到需要外部权限（上传 R2 资产）或本机真实浏览器/WebGL 环境验收的节点，完成其余可验证部分后暂停并通知人工介入。

---

## M1：底座重构与全仓清理（单 Agent 串行）

**目标**：一次性完成双端共享契约、共享路由与历史兼容性清理。

### Step A — 先加门禁并确认红灯

在 `scripts/check-repo.mjs` 中新增以下静态检查，并运行 `pnpm check:repo` 确认精准报出现有违规：

1. **Probe 纯净度**：`viewer/plugins/*/src/probe.ts` 严禁引用浏览器专属全局（`VideoDecoder`、`AudioContext`、`Worker`、`window`、`document`、`navigator`、`DOMParser`、`createImageBitmap`、`OffscreenCanvas`）。
   - 当前已知违规（4 个）：`iwork`、`non-native-audio`、`non-native-video`、`ofd`。
2. **禁止插件源码内联 WASM URL**：`viewer/plugins/*/src/**` 禁止 `new URL(.*\.wasm, import.meta.url)`。
   - 当前已知违规（3 个）：`duckdb`、`pdf`、`sqlite`。
3. **禁止在 `@anyfile/runtime-assets` 外手写打包器 ignore 注释**：`viewer/plugins/*/src/**` 禁止 `webpackIgnore`、`turbopackIgnore`、`@vite-ignore`。
   - 当前已知违规（13 个）：`cad-dwg`、`cad-exchange`、`comic-book`、`djvu`、`ifc`、`mobi`、`modern-raster`、`mpp`、`point-cloud`、`postscript`、`scientific-data`、`stat-data`、`visio`。
4. **双宿主与路由边界**：`src/` 禁止导入 `viewer/agent`、插件 `./extract` 或 Node XML 实现；`viewer/agent` 禁止依赖 `src/` 或 `next`；所有插件路由统一源于 `@anyfile/viewer-registry`。
5. **XML 接口隔离**：凡需供 `./extract` 复用的解析模块，禁止直接调用全局 `DOMParser`。
   - 当前已知使用 `DOMParser` 的插件（13 个）：`chm`、`comic-book`、`epub`、`fictionbook`、`iwork`、`mesh-3d`、`mind-map`、`ofd`、`print-3d`、`pst`、`svg`、`visio`、`xps`。

### Step B — 大刀阔斧改透至全绿

- **依赖与工作区**：根 `package.json` 将 `@types/node` 升级至 `24.x`；将 `viewer/registry` 加入 `pnpm-workspace.yaml`（不作为查看器插件注册）。
- **共享路由 `@anyfile/viewer-registry`**：直接从 `src/lib/registrations/*` 抽离插件路由顺序、`manifest` 与动态 `./probe` 表，Web 宿主仅绑定浏览器 `load()`，直接删除旧平行结构。
- **双端契约 `@anyfile/viewer-protocol`**：新增 `BinarySource`、`StructuredExtractor`、`ExtractContext`、`RgbaImage`、`InspectResult`、`TargetEntry`、`ReadParams`、`ReadResult`、`QueryParams`、`AgentErrorCode`、`AgentFileError` 及可选 `ViewerController.captureImage`。
- **运行时与 XML 底座 `@anyfile/runtime-assets`**：
  - 提供 `importRuntime(url)` 集中处理打包器 ignore 注释；
  - 提供 Node 侧 `/vendor/<pkg>/<version>/` 本地缓存解析与 SHA-256 校验；
  - 通过 `package.json` `"browser"` / `"node"` 条件导出提供统一只读 XML DOM 接口（锁定精确版本的纯 JS XML 解析库）。
- **全仓清理**：照着 `pnpm check:repo` 报错一次性清完上述 4 个 `probe.ts`、3 个 WASM URL、13 个 ignore 注释以及 13 个插件的 `DOMParser` 调用点。

### 验收门禁
```bash
pnpm check && pnpm build
```

---

## M2：`@anyfile/agent` 核心与 3 个黄金样板（单 Agent 串行）

**目标**：建立可复用的合规测试标准与黄金样板插件，跑通 `CLI + MCP + worker_threads` 端到端闭环。

### Step A — 先写合规测试与端到端测试骨架（确认红灯）

1. 在 `@anyfile/testing` 新增 `assertExtractorCompliance(extractor, fixtures)`：
   - 校验 `inspect` 返回结构、`targets`、`capabilities` 与 `matchedBy`；
   - 校验 `read` 默认目标、指定 `target`、`cursor` 翻页、`maxBytes` 裁剪（默认 48 KiB / 硬上限 256 KiB）；
   - 校验可选 `query` 只读保护（拒绝写语句）与 `renderImage` 尺寸边界；
   - 校验 `AbortSignal` 取消、标准 `AgentErrorCode` 映射与执行期间零网络请求。
2. 在 `scripts/check-repo.mjs` 新增规则：凡在 `package.json` 导出 `./extract` 的插件，必须存在 `// @vitest-environment node` 测试文件并接入真实 `examples/` 样例。
3. 为 3 个黄金样板（`plist`、`sqlite`、`pst` 或 `scientific-data`）编写 Node 合规测试，以及 `@anyfile/agent` 的 CLI 子进程 + MCP stdio 端到端测试。

### Step B — 实现至全绿

- 新建 `viewer/agent/`（加入 `pnpm-workspace.yaml`）：
  - `realpath` 白名单校验、只读 `DiskFile` 与 `BinarySource`（Node `fs.readSync` + 显式关闭 fd）、`WorkspaceReader`；
  - 共享路由 + 无后缀/错后缀 Magic Bytes 兜底探测；
  - `worker_threads` 执行池（`resourceLimits`、单次墙钟超时强杀、MCP 内存会话 LRU、CLI 退出即释放不落盘）；
  - 统一字节/行数兜底裁剪器与错误码映射；
  - 自动扫描 `viewer/plugins/*/package.json` 的 `exports["./extract"]` 生成插件映射表；
  - CLI（`anyfile inspect|read|query|cache|mcp`）、MCP stdio server 与 `SKILL.md` 初版。
- 实现 3 个黄金样板插件的 `./extract`：
  - `plist`（纯 JS 结构化提取样板）；
  - `sqlite`（Node 24 `node:sqlite` 只读 + `query_file` 样板）；
  - `pst` 或 `scientific-data`（大文件随机读 / WASM 样板）。

### 验收门禁
```bash
pnpm check && pnpm test viewer/agent
```

---

## M3：视觉渲染宿主与打包资产管线（单 Agent 串行 + 人工介入）

**目标**：打通 `render_file` 双路径（Node 纯像素 + 本机 Chromium CDP）与单一 npm 包 `@anyfile/agent` 构建。

### Step A — 先写渲染与打包门禁（确认红灯）

1. 为纯像素 `renderImage`（`hdr-image`、`photoshop`）编写 Node PNG 输出尺寸与像素校验测试。
2. 为 `renderer-host` 与 CDP 驱动编写受环境变量控制的真实 Chromium 集成测试（覆盖 `ofd`、`cad-2d` 的 `captureImage()` 与无 `captureImage` 节点的默认截图回退）。
3. 在 `scripts/check-view-bundle.mjs` 补齐双宿主 chunk 隔离校验，并在构建流程中加入全量 `/vendor/` SHA-256 清单完整性校验。

### Step B — 实现至全绿

- **纯像素路径**：`agent-core` 接入 PNG 编码，完成 `hdr-image`、`photoshop` 的 `./extract`（含 `renderImage`）。
- **浏览器渲染宿主**：
  - `viewer/agent/renderer-host/` 单一极简 Vite 应用，构建时从 `@anyfile/viewer-registry` 自动生成懒加载表并单次 `vite build`；
  - `127.0.0.1` 隔离 HTTP 服务（COOP/COEP 头、一次性随机 Token 只读 `Range` 端点、`/vendor/*` 透明本地缓存与按需拉取校验）；
  - Node 24 原生 `WebSocket` CDP 驱动（浏览器发现、禁网隔离、等待 `reportPreview`、优先调 `captureImage`、MCP 单实例复用与空闲回收）；
  - 为 `ofd`、`cad-2d` 实现 `ViewerController.captureImage()` 作为视觉黄金样板。
- **单一 npm 包构建**：`@anyfile/agent` 打包脚本产出 CLI/MCP、按插件切分的 `./extract` ESM chunk、`renderer-host` 静态产物、`SKILL.md` 与全量 `/vendor/` SHA-256 清单。

### 验收门禁与人工介入点
- 自动门禁：`pnpm check && pnpm build`
- **人工介入**：
  1. 将 Web 侧原同源分发的 WASM（如 `h5wasm`、`readstat`、`mppgo` 等）补传至 `https://assets.anyfile.top/vendor/` 不可变路径；
  2. 在本机开启环境变量跑一次真实 Chromium / WebGL `render_file` 冒烟测试。

---

## M4：按价值分桶扇出补齐插件（多 Agent 并行）

**目标**：利用 M1~M3 建立的门禁、自动映射与黄金样板，通过多 Agent 并发（Workflow / Swarm）按插件目录无冲突补齐 `./extract` 与 `captureImage`。

### 并发单元规范
- 每个子 Agent 仅修改分配给自己的 1~3 个 `viewer/plugins/<dir>/` 目录；
- 参照 M2/M3 对应类型的黄金样板实现，并补充基于 `examples/` 的 `// @vitest-environment node` 合规测试；
- 单个子 Agent 验收：`pnpm test viewer/plugins/<dir>`；整桶合流验收：`pnpm check`。

### 按 Agent 稀缺价值分桶（从高到低）

| 桶 | 插件范围 | 重点能力 | 参照样板 |
|---|---|---|---|
| **桶 1（高价值专有数据与归档）** | `pst`、`scientific-data`、`stat-data`、`duckdb`、`iwork`、`ofd`、`xps`、`mpp`、`visio`、`ml-weights`、`archive`、`calendar-contacts`、`certificate`、`har`、`torrent` | `./extract`（`inspect`/`read`，`duckdb` 含 `query`） | `plist` / `sqlite` / `pst` |
| **桶 2（电子书与 XML 结构化）** | `epub`、`fictionbook`、`chm`、`comic-book`、`mind-map`、`svg` | `./extract`（复用共享 XML 接口） | `plist` |
| **桶 3（纯像素解码出图）** | `dicom`、`camera-raw`、`modern-raster`、`general-raster`、`pixelmator-pxd` | `./extract`（含 `renderImage` + 元数据） | `hdr-image` / `photoshop` |
| **桶 4（重型文档/CAD/3D 视觉增强）** | `pdf`、`djvu`、`mobi`、`cad-dwg`、`cad-exchange`、`ifc`、`mesh-3d`、`print-3d`、`point-cloud`、`postscript`、`word`、`powerpoint`、`legacy-office` | `ViewerController.captureImage()`（其中 `pdf`/`djvu`/`mobi`/`cad-dwg`/`ifc` 按需补轻量 `./extract` 元数据/文本） | `ofd` / `cad-2d` |
| **桶 5（常规开发/表格收尾）** | `excel`、`code`、`hex`、`font`、`dev-array`、`dev-native-binary`、`dev-source-map`、`dev-wasm` | `./extract` 按需补齐 | `plist` |

> 注：纯音视频播放插件（`browser-video`、`browser-audio`、`non-native-*`、`ffmpeg-*`、`dji-osmo`、`gopro-max`、`insta360`）不做 `./extract` 或按需仅提供 probe/元数据。

---

## M5：文档合流与真实 Agent 验收（单 Agent + 人工）

1. **文档合流**：将最终协议、资产加载、插件开发边界分别并入 `docs/viewer-plugin-protocol.md`、`docs/viewer-loading-and-deployment.md`、`docs/plugin-development.md` 及各插件 `README.md`，删除过渡文档 `docs/agent-file-reading.md` 与本文档。
2. **双端最终回归**：
   - 运行全量 `pnpm check && pnpm build`；
   - 人工在浏览器对 Web 主站核心格式做一次集中抽检（确认无回归）；
   - 使用真实 Coding Agent（CLI + `SKILL.md`）与 MCP 客户端对一组真实冷门文件（`.pst`、`.h5`、`.ofd`、`.dwg`、`.sav`、`.exr`）执行问答与出图任务，根据实际调用日志收敛 `SKILL.md` 提示与错误文案。
