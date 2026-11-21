# 旧版 Office 文档查看器 (`legacy-office`)

在浏览器本地只读解析并展示旧版二进制 Office 文档与富文本文档：`.doc`（Word 97–2003 / Word 6.0）、`.ppt`（PowerPoint 97–2003）和 `.rtf`（Rich Text Format）。

## 基本介绍

- **插件 ID**：`legacy-office`
- **支持格式**：`.doc`、`.ppt`、`.rtf`（均为等级 3：主要内容可用）
- **零外部运行时**：纯 TypeScript 实现 CFBF、MS-DOC、MS-PPT 与 RTF 解析，无外部 WASM 或 CDN 资源依赖
- **文件预算**：主文件上限 128 MiB，单流上限 64 MiB，正文 800 万字符 / 20,000 块，幻灯片 500 页，图片 256 张（48 MiB 总计）

## 实现原理

1. **有界探测**（[src/probe.ts](src/probe.ts)）
   - 仅读取文件前 64–512 字节；识别 CFBF 签名（`D0 CF 11 E0 A1 B1 1A E1`）或 RTF 头（`{\rtf`），拒绝伪装的 ZIP/DOCX 或纯文本文件。
2. **容器与元数据**（[src/cfbf.ts](src/cfbf.ts)）
   - 解析 CFBF v3/v4 FAT、MiniFAT 与目录树（带扇区越界与环路检测），提取 `\x05SummaryInformation` / `\x05DocumentSummaryInformation` 文档属性。
3. **格式解析**
   - **DOC**（[src/doc.ts](src/doc.ts)、[src/doc-tables.ts](src/doc-tables.ts)）：校验 FIB 与加密位；通过 Piece Table（`Clx`/`PlcPcd`）恢复压缩 ANSI/UTF-16LE 正文与脚注，结合 `PlcfBtePapx`/`PlcfBteChpx`/`STSH` 提取标题、列表、表格、粗斜体/字号/颜色、`HYPERLINK` 域及 `Data`/`DggInfo` 内嵌图片；兼容 Word 6.0 文本块与以 `.doc` 保存的 RTF。
   - **PPT**（[src/ppt.ts](src/ppt.ts)、[src/ppt-records.ts](src/ppt-records.ts)）：校验未加密 `Current User` 与 `Document` 容器；提取幻灯片尺寸、`SlideListWithText` 大纲与 `Slide` 图形坐标、`StyleTextPropAtom` 样式、`ExHyperlink` 超链接、`Pictures` 图像及 `Notes` 演讲者备注。
   - **RTF**（[src/rtf.ts](src/rtf.ts)）：支持组状态栈、代码页（`\ansicpgN` / `\fcharsetN`）、`\uN` Unicode、`\colortbl`、`\stylesheet` 标题、列表、表格、超链接与 `\pict` 内嵌图片。
4. **安全渲染**（[src/renderer.ts](src/renderer.ts)、[src/styles.ts](src/styles.ts)）
   - 全部使用 `textContent` 与 DOM API 构建节点，禁用 `innerHTML`；超链接仅放行 `http:`、`https:`、`mailto:`、`tel:` 并附加 `rel="noreferrer noopener"`；图片通过 `Blob` Object URL 挂载并在 `dispose()` 时全部撤销。

## 已知限制

- 不支持密码保护或加密的 `.doc` / `.ppt` 文件（打开时显式拒绝）
- 不执行 VBA 宏、ActiveX 控件或外部链接对象
- 复杂浮动版式、艺术字、SmartArt、矢量 WMF/EMF 图元与动画效果不会完整还原；PPT 仅静态展示每页主要内容与备注
- 只读预览，不提供编辑或格式转换

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)、[样例目录](examples/README.md)

```bash
pnpm test viewer/plugins/legacy-office
```
