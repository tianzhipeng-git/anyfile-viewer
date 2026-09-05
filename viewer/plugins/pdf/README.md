# PDF.js 查看器 (`pdfjs-pdf`)

基于 Mozilla PDF.js 的 PDF 文档浏览器内预览插件。

## 基本介绍

- **插件 ID**：`pdfjs-pdf`
- **支持格式**：`.pdf`（`application/pdf`）及兼容 PDF 的 `.ai`（通过 PDF 签名识别）
- **能力**：分页浏览、缩放、适合宽度、密码保护 PDF 解锁
- **示例文件**：`examples/demo.pdf`

## 实现原理

1. **打开流程**（`src/index.ts`）
   - 读取文件头 1 KiB，校验 `%PDF-` 魔数
   - 通过 `URL.createObjectURL` 将文件交给 PDF.js 加载
   - 建立界面后返回控制器；PDF 加载、密码输入和错误显示在后台继续处理，`onPassword` 不阻塞 `open()`

2. **渲染引擎**（`src/pdf-engine.ts` + `src/pdf-view.ts`）
   - 使用 `pdfjs-dist` 的 `getDocument()`，Worker 指向 `pdf.worker.min.mjs`
   - CMap、ICC、标准字体、WASM 等辅助资源从 `/vendor/pdfjs/{version}/` 静态目录加载（由 `scripts/prepare-pdfjs-assets.mjs` 准备）
   - 每页渲染到 `<canvas>`，通过 IntersectionObserver 按可见性触发渲染，并每批追加 12 页（`PAGE_BATCH_SIZE = 12`）；已追加页面保留在文档中
   - 缩放范围 0.5×–3×，单 canvas 像素上限约 1600 万像素

3. **UI**
   - 纯 DOM + 内联样式，含工具栏（文件名、页码、缩放按钮）和密码输入面板
   - 监听 `ResizeObserver` 与滚动事件，按需重绘可见页

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `pdfjs-dist@6.2.108` | PDF 解析、Worker 与页面渲染 |

运行时还需部署 `public/vendor/pdfjs/` 下的 cmaps、iccs、standard_fonts、wasm 资源。

## 已知限制

- 仅处理 PDF 内容；旧版 PostScript `.ai` 由 postscript 插件处理，不支持 XPS、DjVu
- 不支持表单填写、批注编辑、文本选择复制（PDF.js 文本层未启用）
- 复杂字体/色彩管理依赖静态资源是否完整部署；缺失时可能出现乱码或色彩偏差
- 单页 Canvas 按 1600 万像素预算降低实际渲染比例，极大页面的细节清晰度会受限
- 加密 PDF 仅支持打开密码，不支持证书签名验证
- 插件通过 Blob URL 交给 PDF.js 加载，不在主线程主动整文件复制；解析器、字体及页面缓存仍会占用内存，超大 PDF 受浏览器资源约束

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/pdf-viewer test
```
