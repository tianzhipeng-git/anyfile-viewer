# 电子书与漫画阅读架构及支持矩阵

本文件记录电子书/漫画/固定页阅读插件的共享架构、内容安全模型、权威资源预算与当前支持矩阵。各插件细节与测试命令见 `viewer/plugins/{epub,fictionbook,comic-book,mobi,chm,djvu,xps}/README.md`。

## 1. 架构边界与共享层

- **`@anyfile/rendering-publication`**：服务流式章节出版物（`epub-reader`、`fictionbook-reader`、`mobi-reader`），通过 `PublicationSource` / `SafeChapter` 契约管理 3 章活跃窗口、目录/锚点导航、阅读样式与安全 iframe；不含格式解析器或 ZIP 依赖。
- **独立阅读器**：`comic-book-reader`（CBZ/CBR/CB7/CBT）、`chm-reader`（CHM）、`djvu-reader`（DjVu）保留独立视口；`djvu-reader`、`xps-reader`（XPS/OpenXPS）与 `ofd-reader`（OFD）共用 `@anyfile/viewer-rendering/paged` 分页视口；XPS 与 OFD 另共用 `@anyfile/viewer-rendering/fixed-layout` 的 TrueType 字形轮廓读取与引用计数资源缓存。
- **ZIP 复用**：`@anyfile/archive-metadata-viewer/zip-catalog` 与 `/zip-source`（基于 `@zip.js/zip.js@2.8.60`，仅 Stored/Deflate，有界 `WritableStream`，禁止 `file.arrayBuffer()`）。
- **测试夹具**：自动化协议与插件测试共享 `docs/ebooks/fixtures/`（含 `phase45/` 与 `fonts/Abel-Regular.ttf` SIL OFL 1.1），维护清单见其目录下 `manifest.json`。

## 2. 内容安全与隔离模型

- **无脚本沙箱**：所有章节 iframe 必须使用 `sandbox="allow-same-origin"` 且**严禁同时启用 `allow-scripts`**，配合严格 CSP（`default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'`）；图片与字体仅允许当前实例创建的 `blob:` URL。
- **白名单清洗**：XML 解析前拒绝 `ENTITY`/内部 DTD 并剥离外部 `DOCTYPE`，禁用 XSLT；HTML/SVG 按白名单重建 DOM；CSS 通过 CSSOM 白名单重建（禁用 `@import`、任意 `url()`、自定义属性与越界定位，`@font-face` 仅限容器内资源）；剥离外部链接 `href`。
- **SVG 固有尺寸**：`width="100%" height="100%"` 的内嵌 SVG 必须依据有效 `viewBox` 约束显示尺寸。
- **DRM 边界**：检测到加密、DRM 或字体混淆时返回明确不支持提示，绝不伪装成损坏文件，也不做任何解密/绕过。

## 3. 当前支持矩阵与权威预算

已验证组合的浏览器基线为 Chromium；跨浏览器矩阵仍按需补证。

| 格式/组合 | 插件 | 等级 | 状态 | 能力范围与核心预算 |
|---|---|---:|---|---|
| EPUB 2 / 3 reflowable（UTF-8、无 DRM） | `epub-reader` | 4 | verified | OPF/nav/NCX、LTR/RTL、图片/SVG/字体；包与单章 XML ≤2 MiB、≤2,000 线性章、深度 ≤64、≤2 万节点；CSS ≤256 KiB/文件 / 1 MiB 总量 / 2,000 规则；单章 ≤64 资源 / 32 MiB / 16 MP；≤8 字体×4 MiB；≤3 活跃章。不支持 fixed-layout/字体混淆/MathML/媒体叠加 |
| FB2 / `.fb2.zip`（无加密） | `fictionbook-reader` | 4 | verified | UTF-8 / UTF-16 LE/BE / Windows-1251；嵌套目录、脚注返回、诗歌/表格/图片；原 XML ≤128 MiB（ZIP 条目 ≤32 MiB）、深度 ≤64、≤10 万节点、≤2,000 章、单章 ≤2 MiB / 2 万映射节点、单图 ≤8 MiB、单章 ≤32 图 / 16 MiB / 16 MP；同步 `DOMParser`（映射每 256 节点让出） |
| PalmDOC / MOBI7 / KF8 / 联合 MOBI（无 DRM） | `mobi-reader` | 3 | verified | 自建 `libmobi 0.12-anyfile.2`（LGPL-3.0-or-later，可替换模块与源码发布于 `/vendor/licenses/libmobi/...`）；联合文件选 KF8；输入与重建输出 ≤256 MiB、文本头 ≤32 MiB、≤10,000 记录、≤16 MiB/记录、单展示章 ≤2 MiB、WASM 16 MiB–1 GiB、Worker 60 s 超时；不含词典/Print Replica |
| CBZ / CBT / CBR / CB7（无加密/分卷） | `comic-book-reader` | 4 | verified | 自然页序、ComicInfo、单/双页、滚动、RTL；≤5,000 页、≤16 MiB/页、≤8 MP/页（GIF/WebP/APNG 计帧像素，不含动画 AVIF）、≤5 活跃页；ZIP ≤2 GiB / 4 MiB 目录 / 10,000 条目 / 32 MiB 单条目 / 1000:1；CBT 仅 USTAR（≤2 GiB / 5 MiB 头）；CBR(RAR4/5)/CB7(Copy/LZMA/LZMA2) 用自建 `libarchive 3.8.9-anyfile.1` Worker 单遍顺序解压（输入与总展开 ≤128 MiB / 1000:1 / WASM 16–256 MiB / 60 s）；RAR4 压缩变体待补专项样例 |
| CHM (ITSF v2–3 / LZX) | `chm-reader` | 4 | verified | `.hhc` 目录树、`.hhk` 索引、主题 HTML/样式/图片、沙箱隔离；输入与压缩区展开 ≤128 MiB、单主题 ≤2 MiB；禁用脚本/ActiveX/跨 CHM 链接与全文索引 |
| DjVu（单页 / bundled 多页） | `djvu-reader` | 4 | verified | Canvas 分页、目录树、虚拟化缩略图、可选隐藏文本层；输入 ≤128 MiB、≤5,000 页、≤16 MP/页、≤5 活跃 Canvas；GPLv2+ 源码见 `/source/djvu.html`；不支持 indirect 多文件、`BGjp` 背景与 OCR |
| XPS / OpenXPS（`.xps` / `.oxps`，无 DRM） | `xps-reader` | 4 | implemented | 纯 JS：zip.js 读 OPC 包（含交错 piece），FixedPage → 显示树 → Canvas；路径/纯色与渐变/图片与视觉画刷（含平铺）/裁剪/变换/不透明度蒙版，内嵌与混淆 TrueType 字形轮廓、可选文本层、DocumentStructure 目录；输入 ≤512 MiB、≤10,000 页、单页 ≤20 万元素 / 50 万字形、单图 ≤64 MP；不支持 JPEG XR、CFF 字体（回退系统字体）、ICC 与超链接 |
| OFD（`.ofd`，GB/T 33190，无加密） | `ofd-reader` | 4 | implemented | 纯 JS：zip.js 读包，OFD.xml → Document → 页面/模板/注释/签章 → 显示树 → Canvas；路径/DrawParam/渐变/平铺图案/复合图元/裁剪/CTM，内嵌 TrueType 字形轮廓（含 CGTransform），签章图片取自 SES 签名值（PNG/JPEG/GIF/BMP 或嵌套印章 OFD），文本层与大纲；输入 ≤512 MiB、≤10,000 页、单页 ≤20 万图元 / 50 万字形；不验签，跳过 JBIG2，CFF 与未嵌入字体回退系统字体 |
| 通用归档检查（EPUB/CBZ 等） | `archive-metadata-viewer` | 2 | implemented | 手动备选，仅列目录与压缩信息 |

## 4. 明确排除与未实现候选

- **不纳入范围**：任意 DRM/ACSM/KFX 加密内容、OPDS/云同步、脚本执行、远程资源加载。
- **未实现候选**：EPUB 3 fixed-layout、媒体叠加、全文搜索、Kobo/Apple/DAISY/FB3 与历史格式（LIT/LRF/RB/TCR 等）、CHM 全文索引、DjVu indirect 多文件。
