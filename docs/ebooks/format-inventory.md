# 电子书格式候选清单

- 状态：候选范围，不是当前 Manifest 或已实现能力清单
- 口径：以真实阅读内容、版本、布局、压缩和 DRM 组合为单位
- 相关文档：[架构](architecture.md)、[支持矩阵](support-matrix.md)、[路线图](roadmap.md)

## 1. 纳入原则

一个格式进入路线图至少需要：

- 能在浏览器本地完成解析和查看，不上传用户文件；
- 能展示主要正文或页面，而不仅是 metadata/归档条目；
- 存在可审计规范、实现资料或受维护 parser；
- 可以构造或合法取得覆盖主要变体的固定样例；
- 损坏、压缩炸弹、主动内容、远程资源和 DRM 有明确边界；
- 重型依赖可以延迟加载、取消和释放。

## 2. 第一梯队：直接规划

| 格式/组合 | 扩展名 | 内容模型 | 建议路径 | 首个有意义目标 |
|---|---|---|---|---|
| EPUB 3 reflowable | `.epub` | OCF ZIP + OPF + XHTML/SVG/CSS | EPUB 专用 parser + sandbox viewport | spine、目录、图片、字体、LTR/RTL、滚动阅读 |
| EPUB 2 | `.epub` | OCF ZIP + OPF + NCX + XHTML | 与 EPUB 3 共用容器和章节层 | reading order、NCX 目录、常见 CSS/图片 |
| EPUB 3 fixed-layout | `.epub` | 固定尺寸 XHTML/SVG/图片 | EPUB parser + 固定页 viewport | 页面尺寸、spread、方向和适配 |
| CBZ | `.cbz` | ZIP + 图片 + 可选 ComicInfo.xml | 已有 ZIP 能力基础上做专用页面读取 | 自然排序、分页、RTL、单/双页、虚拟化 |
| FB2 | `.fb2` | XML + base64 图片 | Worker XML parser + 受控 HTML adapter | 章节、脚注、诗歌、图片、metadata |
| FB2 ZIP | `.fb2.zip`、部分 `.zip` | 单个主要 FB2 + 资源 | 有界 ZIP + FB2 adapter | 明确选择主文档，不接管普通 ZIP |

## 3. 第二梯队：独立 spike 后规划

| 格式/组合 | 扩展名 | 难点 | 候选路径 | 状态 |
|---|---|---|---|---|
| MOBI7 / Mobipocket | `.mobi`, `.prc` | PalmDB records、PalmDOC/Huffman 压缩、HTML 方言 | 纯 TS 或裁剪 `libmobi` WASM | planned spike |
| KF8 / AZW3 | `.azw3`, `.azw`, `.mobi` | 双格式容器、KF8 CSS/资源、EXTH | 与 MOBI parser 共用 record 层 | planned spike |
| PalmDOC eBook | `.pdb`, `.prc` | 扩展名歧义、不同 Palm database type | creator/type + record probe | candidate |
| CBR RAR4/RAR5 | `.cbr` | 专有 RAR 变体、随机访问、固实压缩 | 裁剪 libarchive WASM 或专用 decoder | planned spike |
| CB7 | `.cb7` | 7z 索引和固实压缩、内存 | 同一漫画 UI + 7z decoder | planned spike |
| CBT | `.cbt` | TAR 顺序读取、图片资源预算 | 同一漫画 UI + 轻量 TAR path | candidate |
| DjVu single/multipage | `.djvu`, `.djv` | IFF、页解码、文本层、许可 | DjVu.js 或其他可审计本地 decoder | planned spike |
| CHM | `.chm` | ITSF/ITSP、LZX、目录/索引、恶意 HTML | 专用 Worker decoder + safe content host | planned spike |

第二梯队不能统一包装成“导入 Calibre”。每个 parser/decoder 的许可、体积、维护、取消和畸形输入必须独立成立。

## 4. 第三梯队：历史和厂商格式

| 格式 | 扩展名 | 规划态度 | 原因/首要调查点 |
|---|---|---|---|
| Microsoft Reader LIT | `.lit` | candidate | 历史封闭格式、压缩/DRM 变体、样例与 parser 可维护性 |
| Sony BroadBand eBook | `.lrf`, `.lrx` | candidate / DRM blocked | LRF 可评估；LRX 保护内容不解密 |
| Rocket eBook | `.rb` | candidate | 历史容器、压缩和合法样例稀少 |
| TCR | `.tcr` | candidate | 文本压缩格式，价值取决于真实需求与可靠 parser |
| Psion eBook | `.tcr` 等 | candidate | 扩展名/版本歧义，需要内容签名证据 |
| eReader Palm | `.pdb` | candidate | 与 PalmDOC 共享扩展名但内部格式不同 |
| TomeRaider | `.tr2`, `.tr3` | candidate | 稀有、版本和索引语义需要独立样例 |
| Apple Books Author | `.ibooks`, `.iba` | candidate | EPUB 派生或作者工程包，脚本/布局/许可边界复杂 |
| Kobo EPUB | `.kepub`, `.kepub.epub` | candidate | EPUB 派生，先验证普通 EPUB 路径的兼容与专有标记 |
| DAISY 2/3 publication | `.opf`, `.ncc.html` 或归档 | candidate | 多文件工作区、SMIL、音频同步和可访问性语义 |
| FictionBook 3 | `.fb3` | candidate | ZIP/XML 新格式，采用度、规范与样例待证 |

只有真实需求证据出现后才为第三梯队建立 parser；不得为增加扩展名数量而让不可靠路径进入 Manifest。

## 5. 由已有插件承接的格式

| 格式 | 当前/目标所有者 | 电子书规划中的处理 |
|---|---|---|
| PDF | `pdfjs-pdf` | 保持独立；电子书入口可分类展示，不复制 PDF.js |
| TXT | code/text viewer | 保持纯文本查看；阅读主题等增强不阻塞电子书路线图 |
| HTML / HTM | code/text viewer | 当前以源码/文本查看；不把任意 HTML 自动当安全电子书运行 |
| Markdown | code/text viewer | 不新建 ebook parser |
| DOCX | Word viewer | 不归入电子书 runtime |
| 音频书 | audio plugins | 属于音频架构；章节 metadata 可以后跨域讨论 |

## 6. 明确不支持或不是电子书文件

| 项目 | 处理 |
|---|---|
| ACSM | 这是获取/授权描述，不是书籍正文；最多做结构检查，不下载或兑换 |
| Kindle KFX / KCR 受保护内容 | 格式和 DRM 均复杂；在无合规、可维护的明文路径前保持 blocked |
| EPUB ADEPT、Kindle DRM、LCP 等受保护内容 | 检测并说明，不实现密钥提取、破解或解密 |
| 在线书城 URL、OPDS catalog | 不是本地单书查看；不自动登录、下载或同步 |
| 云端 Calibre 转换 | 违反本地读取原则，不作为 fallback |
| 书内 JavaScript、ActiveX、宏 | 始终禁用，不因“兼容模式”执行 |
| 任意远程图片、字体、音视频和 iframe | 默认不加载，不用开放代理绕过 CORS/COEP |

## 7. 固定语料最低集合

### EPUB

- EPUB 2 + NCX；EPUB 3 + nav；
- reflowable LTR、RTL、竖排；fixed-layout 单页和 spread；
- XHTML、SVG spine、内嵌/外部 CSS、图片、字体、ruby、脚注；
- 缺失 rootfile/spine item、非法路径、重复 entry、zip bomb、脚本和远程资源；
- 无加密、字体混淆、已知 DRM 标记。

优先采用 [W3C EPUB 测试套件](https://w3c.github.io/epub-tests/)中许可和用途适合的样例，并记录具体 case；它不替代项目自己的资源上限和恶意输入样例。

### FB2

- 简单长篇、多个 body、脚注/注释、诗歌、表格、内嵌图片；
- UTF-8 和声明的传统编码；`.fb2` 与 `.fb2.zip`；
- 巨大 base64、无效 XML、过深 section、外部实体和伪装 ZIP。

### MOBI / Kindle

- PalmDOC 无压缩/压缩、MOBI7、KF8、联合 MOBI7+KF8；
- EXTH metadata、封面、目录、图片、不同文本编码；
- Huff/CDIC 边界、损坏 record offset、超大 record count、DRM 标记；
- `.mobi`、`.azw`、`.azw3`、歧义 `.prc`/`.pdb`。

### 漫画

- CBZ/CBR/CB7/CBT 各自的普通和固实/压缩变体；
- JPEG、PNG、GIF、WebP、AVIF 页面，嵌套目录和自然数字排序；
- ComicInfo.xml 的 direction、manga、cover、page type；
- 损坏条目、超大像素、重复路径、路径逃逸、加密归档和无图片归档。

### DjVu / CHM

- DjVu 单页、多页 bundled/indirect、bitonal/photo、隐藏文本、损坏 chunk；
- CHM 目录、索引、非 ASCII 文件名、跨 topic 链接、LZX 边界；
- 两者都需要大型文件、取消、连续切换和恶意主动内容反例。

所有第三方样例必须记录来源、许可证、原始哈希和是否可再分发；不适合提交的样例只记录人工验收步骤，不进入仓库。
