# Apple Pages 与 Keynote 查看器 (`iwork`)

在浏览器本地解开 iWork 软件包，提取 Pages 文本与 Keynote 幻灯片（缩略图、文字、演讲者备注）。

## 基本介绍

- **插件 ID**：`iwork`
- **格式入口**：`.pages`、`.key`（`.numbers` 由 `excel-workbook` 处理）
- **能力**：Pages 正文段落、文本框与保存的首页预览；Keynote 按幻灯片树顺序列出缩略图、文字与演讲者备注。
- **支持等级**：IWA（iWork 2013+，含打包为 `Name.key/Index.zip` 的软件包）为 3；iWork '09 XML 为 2；检测到密码保护时为 1，打开时明确提示不支持。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 复用 `archive-metadata-viewer/zip-catalog` 只读 ZIP 中央目录，[src/layout.ts](src/layout.ts) 按条目名识别四种布局：`Index/Document.iwa`、`<bundle>/Index.zip`、`index.xml`/`index.apxl`（可 `.gz`）、`.iwpv2` 密码校验文件。
2. [src/package.ts](src/package.ts) 用 zip.js 读取条目（必要时挂载嵌套 `Index.zip`），统一执行条目数、单条目与图片总量上限；加密条目或非 store/deflate 压缩方法视为密码保护。
3. [src/iwa.ts](src/iwa.ts) 自实现 IWA 分块 + 原始 Snappy 解压与无 schema 的 protobuf 读取，解压输出受总预算约束。
4. [src/model.ts](src/model.ts) 按已知消息类型构建文本模型：
   - Pages：`TP.DocumentArchive`(10000) 字段 4 指向正文 `TSWP.StorageArchive`(2001，字段 3 为文本)；其余无 kind 或 kind=3 的存储作为文本框。
   - Keynote：`KN.DocumentArchive`(1) → `KN.ShowArchive`(2) 字段 3 的幻灯片树 → `KN.SlideNodeArchive`(4，字段 2 指向幻灯片、字段 1 子节点、字段 16 缩略图数据 ID) → `KN.SlideArchive`(5)。每张幻灯片的文字取其所在 `Slide-*.iwa` 中的存储，按标题(5)、正文(6)、绘制对象(7) 占位符引用排序，kind=4 为备注。
   - 数据 ID 通过 `Metadata.iwa` 的 `TSP.PackageMetadata`(11006) 映射为 `Data/` 文件名，缺失时回退 `-<id>.` 后缀匹配。
5. [src/legacy.ts](src/legacy.ts) 解析 iWork '09 XML：Pages 取根节点下 `sf:text-storage[sf:kind=body]` 的段落（跳过模板与占位文本），Keynote 取 `key:slide-list` 中每张幻灯片的段落、`key:notes` 与 `key:thumbnails`。
6. [src/ui.ts](src/ui.ts) 用 `@anyfile/viewer-ui` Inspector 外壳渲染；图片为实例私有 Object URL，销毁时撤销。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/archive-metadata-viewer` | probe 复用的 ZIP 中央目录读取 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | Inspector 外壳与安全 DOM 构造 |
| `@zip.js/zip.js@2.8.60` | ZIP 条目读取与解压（含嵌套 `Index.zip`） |

## 已知限制

- 不渲染版式、字体、表格、图表、图片与媒体；Pages 只显示首页预览图，Keynote 显示保存的幻灯片缩略图。
- 不解密密码保护文档。
- 最多 20,000 个 ZIP 条目、5,000 张幻灯片；单条目 128 MiB，IWA/XML 解压总量 256 MiB，缩略图与预览总计 64 MiB（超出部分仅不显示图片）。
- 幻灯片文字按其所在 `Slide-*.iwa` 归属；多张幻灯片共用一个流时（实际文件中未见）不提取这些幻灯片的文字。

## Agent 提取（`./extract`）

[src/extract.ts](src/extract.ts) 在 Node 中复用 [src/load.ts](src/load.ts) 的同一文本模型（不含图片），只读文本：

- `inspect`：`app`（pages / keynote）、`generation`、幻灯片数、段落与备注数、是否有保存的预览；目标为 Keynote 的 `slide:<n>`，Pages 的 `body`（正文）与 `text-boxes`（文本框）。
- `read`：Markdown；省略 `target` 读全文。无 `filter` 按字节偏移分页（`offset:`），有 `filter` 只返回包含关键字的行（`line:`）。
- 密码保护文档返回 `encrypted-file`；不提供表格、图表与版式（文本模型不含）；`.numbers` 由 `excel` 插件处理。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 真实样例见 [examples/](examples/README.md)。

```bash
pnpm test viewer/plugins/iwork
```
