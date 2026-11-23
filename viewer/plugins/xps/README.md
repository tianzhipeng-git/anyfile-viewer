# XPS / OpenXPS 查看器 (`xps`)

在浏览器本地解开 XPS / OpenXPS 文档包，逐页把 FixedPage 固定版式绘制到 Canvas。

## 基本介绍

- **插件 ID**：`xps-reader`
- **格式入口**：`.xps`（Microsoft XPS）、`.oxps`（ECMA-388 OpenXPS）
- **能力**：矢量路径、纯色/线性/径向渐变、图片与视觉画刷（含 Tile/Flip 平铺）、裁剪、变换、不透明度与不透明度蒙版；内嵌及混淆（`.odttf`）TrueType 字体按字形轮廓绘制；可选文本层、DocumentStructure 目录、缩略图、缩放与适应页面（共享 `@anyfile/viewer-rendering/paged` 视口）。
- **支持等级**：ZIP 中央目录含 `[Content_Types].xml` 与 FixedPage 部件时为 4。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 复用 `archive-metadata-viewer/zip-catalog` 只读中央目录。
2. [src/package.ts](src/package.ts) 用 zip.js 惰性读取 OPC 部件：部件名不区分大小写并解码百分号转义，重组交错的 `<part>/[n].piece … [n].last.piece`，按 BOM 解码 UTF-8/UTF-16，读取 `_rels/*.rels` 关系。
3. [src/document.ts](src/document.ts) 沿 `_rels/.rels` 的 fixedrepresentation → FixedDocumentSequence → FixedDocument → PageContent 收集页面，`LinkTargets` 与页面部件名用于解析 DocumentStructure 的 `OutlineEntry` 目录。XPS 与 OpenXPS 只是命名空间不同，所有匹配按 `localName` 进行。
4. [src/model.ts](src/model.ts) 把 FixedPage 转为显示树（Canvas/Path/Glyphs）：解析属性与属性元素两种写法、`{StaticResource}` 作用域链与远程 `.dict`、画刷、`PathGeometry`、`Indices` 簇映射；节点数、字形数与嵌套深度受预算约束。[src/geometry.ts](src/geometry.ts) 负责矩阵与路径语法（缩写语法即 SVG 路径加 `F0/F1` 填充规则），[src/color.ts](src/color.ts) 负责 sRGB / scRGB / ContextColor（无 ICC 近似）。
5. [src/font.ts](src/font.ts) 按部件名 GUID 还原混淆字体；TrueType `cmap`(4/12)、`hmtx`、`loca`/`glyf`（含复合字形）读取由共享 `@anyfile/viewer-rendering/fixed-layout` 提供（与 `ofd` 共用），输出字体单位下的路径；字体不注册到 `document.fonts`。
6. [src/resources.ts](src/resources.ts) 按需加载字体与图片（JPEG/PNG/GIF 用 `createImageBitmap`，TIFF 动态导入 `general-raster-viewer/tiff`，读取 JFIF/pHYs DPI 以换算 Viewbox），引用计数 + 预算淘汰（共享 `SharedResourceCache`）。
7. [src/painter.ts](src/painter.ts) 用 Canvas 2D 绘制：非纯色填充先裁剪再铺画刷，非纯色描边与不透明度蒙版用临时图层合成；[src/text.ts](src/text.ts) 生成文本层；[src/view.ts](src/view.ts) 接入分页视口并缓存最近 8 个解析页面。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/archive-metadata-viewer` | probe 复用的 ZIP 中央目录读取 |
| `@anyfile/general-raster-viewer` | `./tiff` 子路径，按需解码 TIFF 图片画刷 |
| `@anyfile/viewer-rendering` | `./paged` 分页视口、缩略图、目录与文本层；`./fixed-layout` TrueType 字形轮廓与资源缓存 |
| `@zip.js/zip.js@2.8.60` | OPC 部件惰性解压 |

## 已知限制

- 跳过 JPEG XR（HD Photo / `.wdp`）图片；CFF 轮廓 OpenType 字体与缺失字体用系统字体近似绘制。
- 不应用 ICC 颜色配置文件；Canvas/Path 的 `Opacity` 以 alpha 相乘近似（不做组合成层）；嵌套的不透明度蒙版只处理最外层；`SpreadMethod` 只支持 Pad；`IsSideways` 竖排字形按横排绘制。
- 忽略超链接（`FixedPage.NavigateUri`）、打印票据、数字签名与 DRM（加密包无法解压，按损坏文件报错）。
- 页面尺寸优先取 `PageContent` 的 Width/Height，缺失时先用首页尺寸，渲染后修正。
- 输入 ≤512 MiB（惰性读取，不整体缓冲）、≤50,000 ZIP 条目、≤10,000 页；单个 XML 部件 ≤64 MiB、字体 ≤32 MiB、图片 ≤64 MiB / 64 MP；单页 ≤20 万元素、50 万字形、嵌套深度 64。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 真实样例见 [examples/](examples/README.md)；OpenXPS / piece / 资源字典等合成用例见 [src/test-fixtures.ts](src/test-fixtures.ts)。

```bash
pnpm test viewer/plugins/xps
```
