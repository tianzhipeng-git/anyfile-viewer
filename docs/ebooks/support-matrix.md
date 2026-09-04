# 电子书格式支持矩阵

- 状态：当前能力与规划候选的事实记录
- 口径：`implemented` 表示代码路径存在，`verified` 表示固定样例与自动/真实环境证据齐全；规划目标不等于当前支持
- 相关文档：[架构](architecture.md)、[格式清单](format-inventory.md)、[路线图](roadmap.md)

## 1. 当前仓库事实

| 格式/组合 | 当前插件 | 当前结果 | 当前等级 | 状态 | 主要限制 |
|---|---|---|---:|---|---|
| PDF / 无密码或可输入密码 | `pdfjs-pdf` | PDF.js 分页 Canvas、缩放、适宽 | probe 为 4 | implemented | 无文本层；不是专用 ebook UI；完整真实证据状态需沿 PDF 文档维护 |
| EPUB / ZIP 签名匹配 | `archive-metadata-viewer` | 列出容器条目和压缩信息 | 2 | implemented | 不解析 OCF、OPF、spine、nav/NCX 或正文，不可连续阅读 |
| CBZ / ZIP 签名匹配 | `archive-metadata-viewer` | 列出图片条目和压缩信息 | 2 | implemented | 不排序页面、不解码图片、无单/双页或 RTL 阅读 |
| TXT / HTML / Markdown | `ace-code-text` | 代码/文本查看 | 按该插件现状 | implemented | 不提供电子书目录、排版、资源解析或章节导航 |
| MOBI/AZW/FB2/DjVu/CHM/CBR/CB7/CBT | 无专用插件 | 可能仅剩通用十六进制或无候选 | 0–1 | not implemented | 不能宣传为电子书阅读支持 |

当前仓库没有 `@anyfile/rendering-publication`、`@anyfile/rendering-comic` 或专用电子书阅读器。实现专用 EPUB/CBZ 插件后，通用 archive 插件仍可作为低等级备选，但专用 probe 必须返回更高的真实等级。

## 2. 规划目标矩阵

| 格式组合 | 计划插件 | 首期范围 | 目标等级上限 | 状态 | 关键缺口 |
|---|---|---|---:|---|---|
| EPUB 3 reflowable / 无 DRM | `epub-reader` | metadata、spine、nav、XHTML/CSS、常见图片/字体、滚动阅读 | 4 | planned | parser/renderer 选型、安全隔离和固定语料 |
| EPUB 2 / 无 DRM | `epub-reader` | OPF、NCX、XHTML、常见资源 | 4 | planned | NCX 与老旧 CSS/编码证据 |
| EPUB 3 fixed-layout / 无 DRM | `epub-reader` | viewport、page-spread、方向、SVG/图片页 | 3–4 | planned | spread 与跨浏览器排版 |
| EPUB media overlays / scripted content | `epub-reader` | 首期不执行脚本；overlay 后续评估 | 0–3 | deferred | 音文同步、安全和媒体 codec |
| CBZ | `comic-book-reader` | 图片排序、ComicInfo、单/双页、RTL、虚拟化 | 4–5 | planned | 按页 ZIP 读取和图片预算 |
| FB2 / FB2 ZIP | `fictionbook-reader` | 章节、脚注、诗歌、图片、metadata | 4 | planned | XML adapter、编码、base64 预算 |
| MOBI7 / PalmDOC / 无 DRM | `mobi-reader` | 正文、目录、metadata、图片 | 3–4 | planned spike | parser、Huffman、编码与许可 |
| KF8/AZW3 / 无 DRM | `mobi-reader` | KF8 HTML/CSS、目录、常见资源 | 3–4 | planned spike | 双格式边界和 CSS/资源语义 |
| CBR RAR4/RAR5 | `comic-book-reader` | 与 CBZ 等价的页面 UI | 4–5 | planned spike | decoder、随机访问、固实压缩、许可 |
| CB7 / CBT | `comic-book-reader` | 与 CBZ 等价的页面 UI | 4–5 | candidate | 7z/TAR 解压路径和内存 |
| DjVu single/multipage | `djvu-reader` | 页面渲染、缩略图、导航；文本层按证据 | 3–4 | planned spike | decoder 许可、性能和文本坐标 |
| CHM | `chm-reader` | contents/index、topic HTML、内部导航 | 3–4 | planned spike | LZX、编码、HTML 安全与索引 |
| 历史/厂商格式 | 独立评估 | 先 metadata 或主要正文 spike | 1–3 | candidate | 需求、样例、parser、许可 |
| 任意 DRM 组合 | 无 | 只检测并说明 | 不声明阅读等级 | blocked | 不解密、不规避保护 |

目标等级是完成范围的上限，不是预先承诺。缺少关键内容、顺序、图片、布局或导航时必须降低。

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
