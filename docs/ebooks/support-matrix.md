# 电子书格式支持矩阵

- 状态：当前能力与规划候选的事实记录
- 口径：`implemented` 表示代码路径存在，`verified` 表示固定样例与自动/真实环境证据齐全；规划目标不等于当前支持
- 相关文档：[架构](architecture.md)、[格式清单](format-inventory.md)、[路线图](roadmap.md)

## 1. 当前仓库事实

| 格式/组合 | 当前插件 | 当前结果 | 当前等级 | 状态 | 主要限制 |
|---|---|---|---:|---|---|
| PDF / 无密码或可输入密码 | `pdfjs-pdf` | PDF.js 分页 Canvas、缩放、适宽 | probe 为 4 | implemented | 无文本层；不是专用 ebook UI；完整真实证据状态需沿 PDF 文档维护 |
| EPUB 2/3 reflowable / UTF-8 XML / 无加密 | `epub-reader` | OPF、spine、nav/NCX、正文、资源、连续阅读 | 4 | verified | CSS 白名单；不支持 fixed-layout、字体混淆、MathML、媒体叠加或脚本 |
| EPUB 归档检查 | `archive-metadata-viewer` | 列出容器条目和压缩信息，手动备选 | 2 | implemented | 不提供正文阅读 |
| CBZ / ZIP、ZIP64 / Stored、Deflate / 无加密 | `comic-book-reader` | 自然页序、单/双页、滚动、RTL、ComicInfo、适宽/适高 | 4 | verified | 5,000 页、每页 16 MiB、800 万像素；具体图片组合见下表 |
| CBZ 归档检查 | `archive-metadata-viewer` | 列出图片条目和压缩信息，手动备选 | 2 | implemented | 不提供漫画阅读 |
| TXT / HTML / Markdown | `ace-code-text` | 代码/文本查看 | 按该插件现状 | implemented | 不提供电子书目录、排版、资源解析或章节导航 |
| FB2 / FB2 ZIP / 无加密 | `fictionbook-reader` | 正文、嵌套目录、脚注返回、诗歌、表格、封面与图片 | 4 | verified | UTF-8、UTF-16 LE/BE、Windows-1251；32 MiB XML；仅一个主 FB2 |
| MOBI/AZW/DjVu/CHM/CBR/CB7/CBT | 无专用插件 | 可能仅剩通用十六进制或无候选 | 0–1 | not implemented | 不能宣传为电子书阅读支持 |

当前有独立 EPUB/CBZ/FB2 阅读器；EPUB、FB2 共用 `@anyfile/rendering-publication`。漫画保持独立，尚无 `@anyfile/rendering-comic`。格式 parser 相互隔离，ZIP 与原生图片能力按实际需要复用。真实注册竞争测试确认专用等级 4、archive 等级 2、hex 等级 1；不会自动回退。组合证据见 [验证记录](verification.md)。

## 2. 规划目标矩阵

| 格式组合 | 计划插件 | 首期范围 | 目标等级上限 | 状态 | 关键缺口 |
|---|---|---|---:|---|---|
| EPUB 3 reflowable / 无 DRM | `epub-reader` | metadata、spine、nav、XHTML/CSS、常见图片/字体、滚动阅读 | 4 | verified | UTF-8 XHTML、基础 CSS；字体/SVG/图片及安全证据已落地 |
| EPUB 2 / 无 DRM | `epub-reader` | OPF、NCX、XHTML、常见资源 | 4 | verified | UTF-8 OPF/NCX；传统编码与复杂老旧 CSS 未纳入 |
| EPUB 3 fixed-layout / 无 DRM | `epub-reader` | viewport、page-spread、方向、SVG/图片页 | 3–4 | planned | spread 与跨浏览器排版 |
| EPUB media overlays / scripted content | `epub-reader` | 首期不执行脚本；overlay 后续评估 | 0–3 | deferred | 音文同步、安全和媒体 codec |
| CBZ | `comic-book-reader` | 图片排序、ComicInfo、单/双页、RTL、虚拟化 | 4 | verified | JPEG/PNG/GIF/WebP/静态 AVIF；动画按帧数计入预算，不含 AVIF 动画 |
| FB2 / FB2 ZIP | `fictionbook-reader` | 章节、脚注、诗歌、图片、metadata | 4 | verified | 有界同步 XML；不支持 XSLT、SVG binary、外部资源、复杂样式或加密 |
| MOBI7 / PalmDOC / 无 DRM | `mobi-reader` | 正文、目录、metadata、图片 | 3–4 | planned spike | parser、Huffman、编码与许可 |
| KF8/AZW3 / 无 DRM | `mobi-reader` | KF8 HTML/CSS、目录、常见资源 | 3–4 | planned spike | 双格式边界和 CSS/资源语义 |
| CBR RAR4/RAR5 | `comic-book-reader` | 与 CBZ 等价的页面 UI | 4–5 | planned spike | decoder、随机访问、固实压缩、许可 |
| CB7 / CBT | `comic-book-reader` | 与 CBZ 等价的页面 UI | 4–5 | candidate | 7z/TAR 解压路径和内存 |
| DjVu single/multipage | `djvu-reader` | 页面渲染、缩略图、导航；文本层按证据 | 3–4 | blocked | GPL 分发方案未通过采用门禁；只有样例/许可 spike |
| CHM | `chm-reader` | contents/index、topic HTML、内部导航 | 3–4 | planned spike | LZX、编码、HTML 安全与索引 |
| 历史/厂商格式 | 独立评估 | 先 metadata 或主要正文 spike | 1–3 | candidate | 需求、样例、parser、许可 |
| 任意 DRM 组合 | 无 | 只检测并说明 | 不声明阅读等级 | blocked | 不解密、不规避保护 |

目标等级是完成范围的上限，不是预先承诺。缺少关键内容、顺序、图片、布局或导航时必须降低。

## 2.1 已验证的资源与阅读组合

| 组合 | 证据 | 边界 |
|---|---|---|
| EPUB 2 NCX / EPUB 3 nav / LTR / RTL | `epub2.epub`、`epub3.epub`、`rtl.epub` | 单 OPF，UTF-8 XML，线性 XHTML spine；不支持 SVG spine |
| EPUB 内嵌 PNG、TTF、SVG | `resources.epub` | SVG 作为图片清理；白名单绘图元素，不执行主动内容；字体上限见预算 |
| EPUB 章节与锚点 | 生产浏览器目录、跨章 `#p12`、字号/主题/宽度/resize | 三章窗口；阅读位置只在当前实例中保存 |
| CBZ JPEG、PNG、GIF、WebP、静态 AVIF | `image-formats.cbz` + 原生图片 decoder | GIF/WebP/APNG 的帧数参与像素预算；AVIF 动画暂不纳入 |
| CBZ ZIP64、目录层级和自然排序 | `zip64.cbz`、`pages.cbz` | 不支持分卷、加密或其他压缩方法 |
| ComicInfo 封面/DoublePage/manga | `manga.cbz` | Image 必须为有效且不重复的自然页序索引；类型不隐式重新排列页面 |
| FB2 正文与导航 | `normal.fb2`、`normal.fb2.zip`、`single-fb2.zip`、`utf16.fb2`、`cp1251.fb2` | 多 body、嵌套章节、脚注返回、诗歌/引用/表格、内嵌 PNG 封面；其他原生图片复用已验证 decoder，未逐组合验收 |
| FB2 安全与生命周期 | `malicious.fb2`、`entity.fb2`、`deep.fb2`、`invalid.fb2`、`huge-binary.fb2`；单元测试与生产浏览器 | 无外部实体/XSLT/网络；打开与章节映射取消、重复销毁与文件切换释放；解析器同步调用不可中途终止 |
| 大文件与资源预算 | `hundreds.cbz`、`pixel-budget.cbz`、各类反例 | 当前及邻页有界持有；详见 [阶段 0 决策](phase-0-decisions.md) |

`verified` 的浏览器证据是 Chromium 145.0.7632.6；不是其他浏览器或全部出版物变体已经测试的声明。DRM/字体混淆返回稳定不支持 UI；probe 等级用于有界结构路由，完整内容与保护标记仍由 open 校验。

## 3. 等级口径

| 等级 | 电子书领域解释 |
|---:|---|
| 1 | 只显示签名、metadata、record 或底层结构 |
| 2 | 封面、摘要、归档条目或少量代表页，无法可靠连续阅读 |
| 3 | 主要正文/页面可连续阅读，但明确缺失常见布局、资源或导航语义 |
| 4 | 在声明的版本与无 DRM 子集内，主要内容、顺序、目录、常见资源和方向完整可用 |
| 5 | 等级 4 基础上提供理解该领域所需的阅读交互，例如漫画 spread/RTL/page type 或可靠文本定位 |

字号、主题、缩放和按钮数量本身不提高等级。DRM 检测、封面展示或转成纯文本也不能替代正文能力。

## 4. 组合级证据要求

### 流式出版物

- container/version、package/record 变体、字符编码；
- reading order、目录、内部链接、脚注和 page progression；
- XHTML/HTML/CSS/SVG、图片、字体和 fallback 的实际范围；
- reflowable/fixed、LTR/RTL/竖排/ruby 的声明范围；
- 脚本、远程资源、表单、导航和 XML 外部实体均被阻断；
- 章节、DOM、资源、解压、首屏和内存预算。

### 漫画归档

- ZIP/RAR/7z/TAR 版本与压缩模式；
- 页面格式、自然排序、ComicInfo 覆盖、LTR/RTL 和 spread；
- 单图像像素、累计解码内存、预取和回收；
- 加密、固实归档、损坏 entry、路径逃逸和压缩炸弹；
- 大量页面下首屏、翻页和快速跳转。

### 固定页文档

- 页数、页面尺寸、彩色/灰度/二值层和文本层；
- 单页/多页、bundled/indirect 或内部关联资源；
- 可见页渲染、缩略图、缩放、取消和 Canvas 预算；
- 文本层的顺序、坐标和可访问性，不以“能提取字符”冒充可靠选择。

### 历史二进制格式

- 文件头、版本、record/chunk table、压缩和编码；
- DRM 与未加密组合的可靠区分；
- metadata、正文、目录、图片和 CSS/样式的支持范围；
- parser 在截断、重叠 offset、极端计数和解压炸弹下的边界；
- Worker/WASM 体积、初始化、内存、取消和释放。

## 5. 状态变更规则

- parser/renderer 和已注册路径真实存在后，才能标为 `implemented`；
- 固定正常/反例语料、资源上限、协议测试和真实浏览器 smoke 齐全后，才能标为 `verified`；
- 底层库声称支持某格式，不等于项目支持；
- 通用归档能列条目时保持等级 2，不能据此把 EPUB/CBZ 宣传为可阅读；
- 同一扩展名中的 DRM、版本、布局或压缩能力不同，应拆成组合记录；
- 新专用插件上线时同步更新 Manifest、注册顺序、格式内容页和通用 archive 的竞争证据。
