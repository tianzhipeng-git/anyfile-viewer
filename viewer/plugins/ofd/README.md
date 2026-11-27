# OFD 版式文档查看器 (`ofd`)

在浏览器本地解开 OFD（GB/T 33190）文档包，逐页把版式内容与电子签章绘制到 Canvas。

## 基本介绍

- **插件 ID**：`ofd-reader`
- **格式入口**：`.ofd`（电子发票、公文、电子合同等）
- **能力**：图层、模板页（前景/背景）、PageBlock 与复合图元、裁剪区、CTM、透明度；路径（含 `B` 三次贝塞尔与 `A` 圆弧）、DrawParam 继承链、RGB/GRAY/CMYK/调色板颜色、轴向/径向渐变、平铺图案（水印）；内嵌 TrueType 字形轮廓（`CGTransform` 字形索引、连字簇、`CharDirection`、`HScale`），未嵌入/CFF 字体按字体名回退系统字体；图片对象；注释外观；签章位置上的印章图片（PNG/JPEG/GIF/BMP 或嵌套印章 OFD）；可选文本层、大纲、缩略图与缩放（共享 `@anyfile/viewer-rendering/paged` 视口）。
- **支持等级**：ZIP 中央目录根部含 `OFD.xml` 时为 4。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 复用 `archive-metadata-viewer/zip-catalog` 只读中央目录。
2. [src/package.ts](src/package.ts) 用 zip.js（`tolerant`，兼容开票软件写出的不规范 ZIP）惰性读取部件；路径大小写不敏感，`ST_Loc` 先按所在目录解析，再回退包根目录（兼容不规范路径）。
3. [src/document.ts](src/document.ts) 沿 `OFD.xml` → 首个 `DocRoot` 读取页面列表、PublicRes/DocumentRes、模板页、大纲（`Goto/Dest PageID`）、注释索引与签名列表（`StampAnnot` 的 `PageRef`/`Boundary` 和 SignedValue / Seal 文件）。所有元素按 `localName` 匹配，忽略命名空间差异。
4. [src/res.ts](src/res.ts) 解析资源表（字体、颜色空间、DrawParam、复合图元、多媒体），页面资源回退到文档资源。
5. [src/model.ts](src/model.ts) 把页面（背景模板 → 图层按 Background/Body/Foreground → 前景模板 → 注释 → 签章）转为显示树；`TextCode` 的 `g n v` 增量、跨 TextCode 的 `CGTransform` 码位与连字簇在此展开；图元数、字形数与嵌套深度受预算约束。[src/geometry.ts](src/geometry.ts) 把 `AbbreviatedData` 转为 SVG 路径，[src/color.ts](src/color.ts) 负责颜色与渐变。XML 中的 CDATA 先转义为文本（[src/xml.ts](src/xml.ts)）。
6. [src/seal.ts](src/seal.ts) 有界遍历 DER 树（含 OCTET STRING 内嵌的 DER），取第一个图片或 ZIP（印章 OFD）作为印章外观，兼容 GM/T 0031 V1 与 GB/T 38540 V4；[src/view.ts](src/view.ts) 把嵌套印章 OFD 首页按 ~300 dpi 栅格化为透明画布（不再递归）。
7. [src/assets.ts](src/assets.ts) 通过共享 `@anyfile/viewer-rendering/fixed-layout` 的 TrueType 轮廓读取器与引用计数缓存按需加载字体、图片与印章；[src/painter.ts](src/painter.ts) 用 Canvas 2D 绘制，[src/text.ts](src/text.ts) 生成文本层，[src/view.ts](src/view.ts) 接入分页视口（毫米 → CSS 像素按 96 dpi）并缓存最近 8 个解析页面。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/archive-metadata-viewer` | probe 复用的 ZIP 中央目录读取 |
| `@anyfile/viewer-rendering` | `./paged` 分页视口；`./fixed-layout` TrueType 字形轮廓与资源缓存（与 `xps` 共用） |
| `@zip.js/zip.js@2.8.60` | 部件惰性解压 |

## 已知限制

- 只显示签章，不做证书与签名验证；不处理附件、自定义标签、权限与加密 OFD（加密部件按损坏报错）。
- 跳过 JBIG2（`.jb2`）等浏览器不能解码的图片与图像蒙版；CFF 轮廓字体与未嵌入字体用系统字体近似，`DeltaX` 缺省时按字宽估算步进。
- 渐变按 Canvas 默认外延绘制（忽略 `Extend`/`MapType` 与椭圆参数）；不支持混合模式（`BlendMode`）；裁剪区内多个 Area 共用第一个 Area 的变换；对象不按 `Boundary` 裁剪。
- 只读取首个 `DocBody` 文档；页面尺寸未解析前先用文档 `PageArea`，渲染后修正。
- 输入 ≤512 MiB（惰性读取）、≤50,000 ZIP 条目、≤10,000 页；单个 XML ≤64 MiB、字体 ≤32 MiB、图片 ≤64 MiB / 64 MP、签名值 ≤16 MiB；单页 ≤20 万图元、50 万字形、嵌套深度 32。

## Agent 提取（`./extract`）

[src/extract.ts](src/extract.ts) 在 Node 中复用 `document.ts` / `model.ts` / `text.ts` 的同一页面模型，只读文本与结构（出图走浏览器 `captureImage()`）：

- `inspect`：`documentInfo`（`DocInfo` 字段，`CustomData` 记为 `Custom:<Name>`）、页数、`PageArea`、签名数与签章数、大纲条目数；目标为 `page:<n>`（标题注明本页签章数）。
- `read`：Markdown；`page:<n>` 为该页文本，按行（自上而下、行内自左向右）排列并注明签章；省略 `target` 时为文档信息 + 全部页面，只解析到当前分页窗口所需的页面。无 `filter` 按字节偏移分页（`offset:`），有 `filter` 只返回包含关键字的行（`line:`）。
- 不做签名验证，不输出图片、印章图像与版式坐标。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 真实样例见 [examples/](examples/README.md)；DrawParam 链、渐变、CDATA、连字簇、复合图元与大纲等合成用例见 [src/test-fixtures.ts](src/test-fixtures.ts)。

```bash
pnpm test viewer/plugins/ofd
# 可选：解析本地目录中所有 .ofd 的每一页并定位每个签章图片
OFD_TEST_DIR=/abs/ofd-samples pnpm test viewer/plugins/ofd
```
