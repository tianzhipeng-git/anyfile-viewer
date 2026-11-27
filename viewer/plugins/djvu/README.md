# DjVu 电子书阅读器 (`djvu-reader`)

## 基本介绍

- **插件 ID**：`djvu-reader`，等级 4（bundled / 单页）与等级 2（indirect 提示）
- **格式入口**：`.djvu`、`.djv`，有界头部探测识别 `AT&TFORM` / `FORM` 下的 `DJVU`、`DJVM`、`PM44`、`BM44`
- 文档完全在浏览器本地解码和渲染，不上传文件，不转成 PDF，不生成 OCR。

## 实现原理

- 专用可终止 Worker（[decoder.worker.ts](src/decoder.worker.ts)，仅做消息转发；WASM 调用在与 Node 共用的 [engine.ts](src/engine.ts)）按需加载自建 `DjVuLibre 3.5.29-anyfile.1` WebAssembly（`djvu.js` + `djvu.wasm`）。
- 打开时仅解析 `DIRM`、`NAVM` 目录与每页 `INFO` 头部尺寸，不解码全书像素；通过 `@anyfile/viewer-rendering/paged` 的 `PagedDocumentSource` 驱动主线程可视区域虚拟化渲染 Canvas，并在超出活跃窗口（5 页）时回收离屏 Canvas。
- 侧边栏复用共享分页视口提供书签目录（`NAVM`）与按需挂载的虚拟化缩略图（最多缓存 24 张）。
- 当页内存在 `DjVuTXT` 隐藏文本层且词框坐标校验通过时，通过共享文本层叠加透明可选文本。

## 运行时与预算

- 自建 `3.5.29-anyfile.1`：DjVuLibre 3.5.29（`libdjvulibre`）+ 单线程 Emscripten 补丁，Emscripten 4.0.10 构建。构建配方见 [tools/djvulibre-build](../../../tools/djvulibre-build/README.md)。
- WASM 初始内存 16 MiB，上限 512 MiB；C 栈 2 MiB（`STACK_OVERFLOW_CHECK=2`）。
- 预算：文件 128 MiB、最多 5,000 页、单页原图 2.5 亿像素、单次 Canvas 渲染 1,600 万像素、活跃 Canvas 5 页、缩略图 24 张、单次操作 30 秒。超限返回 `resource-limit`。
- 来源 `R2 → 同版本同源`，仅初始化失败时回退；文件解析错误不触发资产回退。

## Agent 提取（`./extract`）

[src/extract.ts](src/extract.ts) 在 Node 中通过 `context.vendor` 加载同一 `djvulibre/3.5.29-anyfile.1` WASM，复用 `engine.ts`；djvulibre 从内存文件系统解析，因此整文件读入（128 MiB 上限，超出返回 `resource-limit`）：

- `inspect`：文档结构（single / bundled…）、页数、页面像素尺寸与 DPI、`NAVM` 书签标题（附页码）、前 200 页中含隐藏文本层的页数；目标为 `page:<n>`。当前 WASM 未导出文档元数据/注释（`ANTa`/`ANTz`），不提供。
- `read`：Markdown；`page:<n>` 为该页 `DjVuTXT` 隐藏文本层，按行（自上而下、行内自左向右）排列；无文本层的页注明 `(no hidden text layer on this page)`，不做 OCR。省略 `target` 时为全部页面（按需解析到分页窗口），`filter` 按行过滤。
- indirect 多文件 DjVu 返回 `missing-related-file`。
- 浏览器 `captureImage({ target, maxDimension })`：`target` 为 `page:<n>` 或页码（默认第 1 页），经 Worker 解码单页 RGBA，不超过原始分辨率、`maxDimension` 与 1,600 万像素上限，不含工具栏；未知页返回 `target-not-found`。

## 许可证

DjVuLibre 为 `GPL-2.0-or-later`。集成 DjVu 查看器的组合分发受 GPLv2+ 约束，构建时生成 `/source/djvu.html`、对应应用源码压缩包 `/source/application.tar.gz` 与上游源码 `/vendor/licenses/djvulibre/3.5.29-anyfile.1/djvulibre-source.tar.gz`，查看器底部提供可见链接。

## 已知限制

- 仅支持单页（`FORM:DJVU` / `PM44` / `BM44`）与 bundled 多页（`FORM:DJVM`）；引用外部单页文件的 `indirect` / `old-indexed` 多文件 DjVu 会明确返回 `missing-related-file`。
- 未启用 `libjpeg` 外部解码器，`BGjp` JPEG 背景变体不包含在当前支持范围内。

## 开发与验证

```bash
pnpm test viewer/plugins/djvu
# 可选本地真实样例（不入库）
DJVU_TEST_FILE=/abs/path/to/book.djvu pnpm test viewer/plugins/djvu
```
