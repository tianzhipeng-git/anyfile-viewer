# PDF 查看器 (`pdfjs-pdf`)

基于 Mozilla PDF.js 的 PDF 文档浏览器内预览插件。

## 基本介绍

- **插件 ID**：`pdfjs-pdf`
- **支持格式**：`.pdf`（`application/pdf`）
- **能力**：分页浏览、缩放、适合宽度、密码保护 PDF 解锁
- **示例文件**：`examples/demo.pdf`

## 实现原理

1. **打开流程**（`src/index.ts`）
   - 读取文件头 1 KiB，校验 `%PDF-` 魔数
   - 通过 `URL.createObjectURL` 将文件交给 PDF.js 加载
   - 处理 `onPassword` / `onProgress` 回调，映射到协议进度阶段

2. **渲染引擎**（`src/pdf-engine.ts` + `src/pdf-view.ts`）
   - 使用 `pdfjs-dist` 的 `getDocument()`，Worker 指向 `pdf.worker.min.mjs`
   - CMap、ICC、标准字体、WASM 等辅助资源从 `/vendor/pdfjs/{version}/` 静态目录加载（由 `scripts/prepare-pdfjs-assets.mjs` 准备）
   - 每页渲染到 `<canvas>`，采用虚拟滚动 + 分批渲染（`PAGE_BATCH_SIZE = 12`）
   - 缩放范围 0.5×–3×，单 canvas 像素上限约 1600 万像素

3. **UI**
   - 纯 DOM + 内联样式，含工具栏（文件名、页码、缩放按钮）和密码输入面板
   - 监听 `ResizeObserver` 与滚动事件，按需重绘可见页

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议与错误类型 |
| `pdfjs-dist@6.2.108` | PDF 解析与渲染 |

运行时还需部署 `public/vendor/pdfjs/` 下的 cmaps、iccs、standard_fonts、wasm 资源。

## 已知限制

- 仅支持 PDF，不支持 XPS、DjVu 等格式
- 不支持表单填写、批注编辑、文本选择复制（PDF.js 文本层未启用）
- 复杂字体/色彩管理依赖静态资源是否完整部署；缺失时可能出现乱码或色彩偏差
- 极大页面或极高缩放可能触发 canvas 像素上限，导致部分页渲染失败
- 加密 PDF 仅支持打开密码，不支持证书签名验证
- 文件须完整读入内存（通过 blob URL），超大 PDF 受浏览器内存约束
