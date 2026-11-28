# Agent 文件读取：M4 交接

过渡文档，配合 `docs/agent-file-reading-plan.md` 使用；M5 文档合流时与计划文档一起删除。

## 当前状态

M4 提前收尾：已完成的合入 `dev`，门禁 `pnpm check`、`pnpm build`、`viewer/agent` Chromium 集成测试均为绿。

### 已完成

- **`./extract`（32 个插件）**
  - 桶 1 全部：`duckdb`（含只读 SQL `query`）、`torrent`、`scientific-data`、`ml-weights`、`mpp`、`visio`、`iwork`、`ofd`、`xps`、`archive`、`calendar-contacts`、`certificate`、`har`
  - 桶 2：`epub`、`fictionbook`、`chm`、`comic-book`、`mind-map`、`svg`、`design-source`
  - 桶 3：`dicom`、`general-raster`、`modern-raster`、`camera-raw`
  - 桶 4：`pdf`、`djvu`
  - 以及 M2/M3 的样板插件
- **`captureImage`**
  - `@anyfile/rendering-3d` 的 `captureSceneImage`（`src/capture.ts`）离屏正交渲染，支持 `top`/`front`/`right`/`iso` 视角；`mesh-3d`、`print-3d`、`point-cloud`、`ifc`、`cad-exchange`、`cad-dwg` 透传 `create3dViewer` 返回的 `captureImage`。
  - `pdf`、`djvu`、`ofd`、`cad-2d` 各自实现按页截图。
- **共享能力**（`@anyfile/viewer-protocol`）
  - `readPagedTextDocument` / `parsePageTarget` / `markdownDocumentHeader`：分页文本读取。
  - `downscaleRgba`：RGBA 缩略。
  - `@anyfile/rendering-publication/text`：电子书 XHTML → Markdown。
  - `@anyfile/raw-decoder` 的 `loadLibRawFromVendor`：Node 侧 LibRaw。
- **Agent 运行时**
  - `ANYFILE_BROWSER_ARGS`：给渲染用 Chromium 追加启动参数。例如 Ubuntu 的 AppArmor 限制了 userns 时，需要设成 `--no-sandbox`。
  - `pnpm generate:agent`：生成提取器、渲染器加载器和 vendor 插件映射；产物已 gitignore，`typecheck`/`test`/`build` 会先跑它。

### 未做

- 桶 4：`mobi` 的 `./extract`；`postscript`、`word`、`powerpoint`、`legacy-office` 的 `captureImage`；`cad-dwg`、`ifc` 的元数据 `./extract`。
- 桶 5 全部：`excel`、`font`、`dev-array`、`dev-native-binary`、`dev-source-map`、`dev-wasm`（`code`、`hex` 已决定不做）。
- `pixelmator-pxd`：没有可公开分发的 `.pxd` 样例。

## 待决问题

1. **打包产物 `viewer/agent/dist/cli.mjs` 有 3 个插件失败**；源码模式的 CLI 正常，现有测试不覆盖 dist：
   - `duckdb`：ESM 包里的 DuckDB CJS 代码引用了 `__dirname`。
   - `modern-raster` JXL：运行时 `import.meta.resolve("jxl-oxide-wasm/module.wasm")`，dist 没带这个包。
   - `pdf`：pdf.js 的 `DOMMatrix` polyfill 来自可选原生依赖 `@napi-rs/canvas`，dist 解析不到。

   修复要改 M3 的打包脚本（`viewer/agent/scripts/`），并决定原生依赖是否随包分发。建议同时加一个用 dist 跑 CLI 冒烟测试的门禁。
2. **DuckDB 的 parquet/json 扩展未 vendored**：Web 和 Agent 端都会从 `extensions.duckdb.org` 下载，与“不联网”的定位冲突。需要放进 `/vendor/` 并上传 R2。
3. **`epub`、`fictionbook` 样例是项目自生成的 CC0 文件**，覆盖不到语言、出版社等真实元数据，可换成 Project Gutenberg 等公有领域真实书籍。
4. `scientific-data/policy.json` 可考虑登记 `src/hdf5-node.ts`（Node 侧 HDF5 文件节点）。

## 并行开发注意

- 用 worktree 隔离的子 Agent 默认从 `main` 开分支，第一步必须 `git reset --hard dev`。
- 然后 `pnpm install --offline --frozen-lockfile`，并把主检出的 `public/vendor` 软链进来（gitignore 的 WASM 资产，提取测试需要）。
- `scripts/check-repo.mjs` 的 `PLUGINS_WITHOUT_SAMPLES` 多个分支同时改容易冲突，合并时手工解决。
- WASM 合规测试在全量并行下可能超过 5 秒，加显式超时（现有用 `30_000`）。
