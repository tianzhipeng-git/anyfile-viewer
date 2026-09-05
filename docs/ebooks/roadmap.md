# 电子书查看实施路线图

- 状态：阶段 0 首批门禁与阶段 1–3 已交付（2026-09-05）；阶段 4 以后未实施
- 范围：流式电子书、漫画归档、固定页电子书和历史二进制电子书
- 相关文档：[架构](architecture.md)、[格式清单](format-inventory.md)、[支持矩阵](support-matrix.md)

## 1. 优先级与交付原则

候选依次评价：

1. 用户遇到频率和无需安装桌面阅读器即可查看的价值；
2. 能否显示主要正文/页面，而不是只增加扩展名；
3. 是否有维护中的浏览器 parser、清楚许可证和可再分发样例；
4. 主动内容、DRM、压缩和畸形输入是否可安全隔离；
5. 首屏、内存、按需读取、取消和释放是否可控；
6. 是否能复用已经由两个格式验证的阅读层，而不把重型 decoder 合并。

每个格式不可放松的底线：

- 默认视图能看到正确的首章或首页；
- reading order/page order、目录或页导航可靠；
- 书内脚本不执行，远程资源不自动加载，文件不上传；
- 损坏、DRM、缺失资源、环境缺失和资源超限有准确状态；
- opening/active abort、连续切换和重复 dispose 后没有 Worker、iframe、Object URL、Canvas 或监听残留；
- 重型实现不进入 Manifest、probe、`/view` 首包或其他插件 chunk。

## 2. 阶段 0：证据、安全和依赖 spike

已完成首批交付门禁。详见 [决策与预算](phase-0-decisions.md)、[固定语料](fixtures/manifest.json)、[候选审计](evidence/dependency-spike.json)。

阶段 0 的重型候选采用先许可/架构、后构建的停止门禁：未通过采用决策的方案保留 planned/blocked，不生成实验运行资产；浏览器 Worker/WASM、初始化、内存和取消测试仍是后续阶段 4–7 的必经条件。本次样例/header/原生索引 spike 不等于这些 decoder 已通过浏览器验收。CHM 目前只有 ITSF 反例，正常 topic 阅读语料也保留在阶段 7。


### 工作项

- 按格式清单建立 EPUB、CBZ、FB2 的首批正常/反例固定语料及 manifest/hash；
- 取得 MOBI7/KF8、RAR4/RAR5/7z、DjVu、CHM 的合法 spike 样例；
- 测量现有 archive ZIP 能力能否支持按 entry、按需和可取消读取，决定复用或提取边界；
- 比较自有 EPUB parser + 安全 iframe 与 EPUB.js，记录维护、体积、行为和安全差异；
- spike 书内 HTML/CSS 清理、URL 重写和无脚本 sandbox，验证网络、导航和宿主访问被阻断；
- spike `libmobi`、DjVu.js 和裁剪 libarchive 的许可、构建、Worker、体积、内存和取消；
- 为章节、DOM、图片、字体、归档展开和 Canvas 建立有测量依据的初始预算；
- 定义 DRM/加密检测结果和与 Viewer Protocol 一致的错误/UI 行为；
- 记录所有未选方案及拒绝原因。

### 完成标准

- 架构、格式清单、支持矩阵、样例来源和依赖审计一致；
- EPUB/CBZ/FB2 各有至少一个正常主路径和关键恶意反例；
- safe content host 在当前隔离页面中不执行脚本、不发远程请求、不越过插件 DOM；
- 任何候选重型依赖都只出现在实验插件 chunk，未进入首包；
- 资源预算有基准数据，未通过的格式保持 planned/blocked。

## 3. 阶段 1：EPUB 2/3 reflowable

已交付 `epub-reader`，等级 4；EPUB 2/NCX、EPUB 3/nav、LTR/RTL、内部 anchor、连续章节、字体/图片、排版与安全测试见 [验证记录](verification.md)。当前最多当前及前后共三章，基础 CSS 为显式白名单；fixed-layout、MathML、竖排、媒体叠加和字体混淆未纳入 verified。缺失可选图片保留正文并给出局部提示。


### 范围

- EPUB 3 OCF、container.xml、单 package document；
- metadata、manifest、spine、EPUB 3 navigation document；
- EPUB 2 OPF/NCX 兼容路径；
- XHTML 内容、常见 CSS、JPEG/PNG/GIF/WebP/SVG 与常见内嵌字体；
- reflowable 连续滚动、目录、章节跳转、字号/行高/内容宽度/主题；
- LTR/RTL；竖排、ruby、MathML 按证据逐项纳入。

### 实施要求

- 建立独立 `epub-reader` 插件和有界 OCF probe；
- parser 与 renderer 分离，当前章节和邻近章节按需解压；
- 清理 HTML/SVG/CSS，重写内部资源和 fragment，不执行 scripted content；
- 不自动加载 EPUB 声明的 remote resources；
- resize、主题或字号变化后保留 spine + anchor 语义位置；
- EPUB 专用插件返回高于 archive viewer 的真实等级，archive 仍保留手动备选；
- 固定 EPUB 2/3、LTR/RTL、字体/图片和恶意内容浏览器测试。

### 完成标准

- 可从目录进入任意章节并连续阅读，前后章节顺序正确；
- 内部链接、图片、字体和基础样式在声明范围内工作；
- 脚本、表单、弹窗、顶层导航、远程请求和宿主 DOM 访问全部被测试阻断；
- 大章节、过深 DOM、zip bomb、缺失 spine resource 和 DRM 标记产生准确结果；
- 快速章节切换和文件切换后资源均释放；
- 生产构建确认 EPUB 完整实现只在选择 EPUB 后加载。

## 4. 阶段 2：CBZ 漫画阅读

已交付 `comic-book-reader`，等级 4；ZIP/ZIP64、五种原生静态图片、自然排序、ComicInfo、封面/双页/RTL、键盘、缩放与连续虚拟化已验收。最多四页活跃资源；800 万像素与 300 页基准见 [验证记录](verification.md)。动画 GIF/WebP/APNG 按帧数计入预算；无有界帧数的 AVIF 动画不纳入阅读路径。


### 范围

- 普通 ZIP/ZIP64 中的 JPEG、PNG、GIF、WebP；AVIF 依据当前图片 runtime 能力；
- 根目录或嵌套目录页面、跨平台自然数字排序；
- 可选 ComicInfo.xml 的页类型、方向和 manga 信息；
- 单页、双页、连续滚动、LTR/RTL、适宽/适高；
- 封面单页和有界邻页预取。

### 实施要求

- 建立 `comic-book-reader`，只接受签名与内容结构均合理的 CBZ；
- 复用已有图片解码能力，不能复制完整图片格式栈；
- 只为可见页和邻页持有解压字节、ImageBitmap/图片和 Object URL；
- 图片文件名默认自然排序，ComicInfo 只在校验通过后覆盖顺序/语义；
- 加密 ZIP 提供明确不支持状态，不等待不存在的宿主密码协议；
- archive viewer 保留为低等级备选。

### 完成标准

- 1、2、3、10 页等文件名顺序稳定，目录层级不会意外打乱页面；
- LTR/RTL、封面和奇偶页 spread 正确；
- 数百页文件首屏不等待全书图片解码，离屏页被释放；
- 超大像素、过多 entries、重复路径、损坏图片和压缩炸弹均有反例；
- 键盘翻页、页码跳转、缩放和 resize 可用且无资源残留。

## 5. 阶段 3：FB2 与最小共享阅读层

已交付 `fictionbook-reader`，等级 4。FB2 与 EPUB 共同使用 `@anyfile/rendering-publication` 的三章视口、目录、排版、隔离 iframe 和清理生命周期；共享接口只接收章节定位符与 `loadSection()`，不导入格式 parser 或 ZIP。支持 UTF-8、UTF-16 LE/BE、Windows-1251、单主文档 FB2 ZIP、元数据、封面、嵌套目录、脚注与返回、诗歌、引用和基本表格。具体边界与证据见 [阶段 3 验证](verification.md#阶段-3fb2-与共享阅读层)。

### 工作项

- 建立 `fictionbook-reader` 和 `.fb2` 内容 probe；
- 为 `.fb2.zip` 使用复合扩展名，普通 `.zip` 只有有界识别到单一主 FB2 时才参与候选；
- 解析 description、body、section、title、subtitle、p、poem、cite、epigraph、table、a、image、binary 的明确子集；
- 将 FB2 结构显式映射为安全 HTML，不执行 XSLT 或外部实体；
- 支持章节目录、脚注回跳、metadata、封面和按需 base64 图片；
- EPUB 与 FB2 共同使用已验证的章节 viewport、导航、排版和清理生命周期。

### 完成标准

- 正文结构、脚注、诗歌和图片在声明范围内可理解；
- 编码、无效 XML、过深 section、巨大 base64 和外部实体有测试；
- 提取的共享层不导入 EPUB ZIP/parser 或 FB2 XML/parser；
- 打开 EPUB 不下载或加载 FB2 实现，反之亦然。

## 6. 阶段 4：MOBI7、PalmDOC 与 KF8/AZW3

### 先行决策

- 比较纯 TypeScript 与裁剪 `libmobi` WASM；
- 对 LGPL-3.0、可替换性/链接方式、NOTICE/source offer 等分发义务取得明确结论；
- 验证 PalmDOC、Huffman/CDIC、MOBI7、KF8 与联合文件；
- 测量初始化、整书解压、章节切分、峰值内存和 Worker 终止；
- 无法满足许可、安全、体积或维护门槛时停止，不用云端转换兜底。

### 首批范围

- 无 DRM PalmDOC/MOBI7 的正文、metadata、目录和常见图片；
- 无 DRM KF8/AZW3 的 HTML/CSS 和常见资源；
- `.mobi`、`.azw`、`.azw3`；`.prc`/`.pdb` 只在 creator/type 可确认时加入；
- DRM 文件仅检测并明确说明不可阅读。

### 完成标准

- 文本顺序、编码、目录和图片对固定语料正确；
- 联合 MOBI7/KF8 文件选择规则稳定且不重复显示正文；
- 损坏 offset、极端 record count、解压炸弹和 DRM 标记有反例；
- parser 在 Worker 中可取消，输出按章节进入共享阅读层；
- Manifest 只声明已验证组合，不把 KFX 或所有 `.pdb` 一并纳入。

## 7. 阶段 5：CBR、CB7、CBT

### 候选顺序

1. CBT：轻量 TAR 路径；
2. CBR：RAR4，再按 decoder 证据加入 RAR5；
3. CB7：7z，特别验证固实压缩和随机跳页。

### 工作项

- 复用漫画页面模型和 UI，仅替换 archive adapter；
- 若采用 libarchive WASM，只构建读取所需格式/压缩模块；
- 对不能随机访问的固实归档设计顺序解压、邻页缓存和快速跳转限制；
- 检测加密归档并明确失败，不隐式暴力尝试密码；
- 与通用 archive 插件的扩展名、probe 等级和注册顺序建立竞争测试。

### 完成标准

- 每种已声明容器均达到与 CBZ 一致的排序和阅读底线；
- 不因一个 CBR 打开操作加载所有无关 archive writer/decoder；
- 固实大归档的内存和跳页退化有量化限制；
- Worker、WASM、解压 buffer 和图片缓存在切换后释放。

## 8. 阶段 6：DjVu

### 工作项

- 评估 DjVu.js、其他可审计实现或源码构建 decoder；
- 完成 GPLv2/其他许可证、分发和项目兼容性评审；
- 支持单页、多页 bundled；indirect 多文件只有工作区读取路径明确后加入；
- 按可见页在 Worker 中解码，主线程虚拟化 Canvas 和缩略图；
- 文本层只有阅读顺序和坐标可靠时启用；
- 不生成 OCR、不转成 PDF。

### 完成标准

- 声明范围内页面顺序、尺寸和视觉结果正确；
- 大文档首屏不等待所有页，快速滚动有内存上限；
- 损坏 IFF/chunk、极大页面、取消和 decoder 失败有测试；
- 许可证或维护门槛未通过时保持 blocked，不提交运行资产。

## 9. 阶段 7：CHM

### 工作项

- spike ITSF/ITSP directory、LZX、contents、index 和 topic 编码；
- 将 HTML topic 送入 safe content host，处理内部链接和 anchor；
- 移除 ActiveX、脚本、表单、`ms-its:` 越界引用和远程资源；
- 支持目录树、主题导航、前进/后退；全文索引不是首期门槛；
- 为非 ASCII 路径、缺失 topic、循环链接和压缩边界建立语料。

### 完成标准

- 主要 topic、目录和内部链接可用，无法显示的对象有局部说明；
- CHM 内容不能导航宿主页或访问网络；
- LZX 解码可取消且受展开预算约束；
- parser/decoder 仅在 CHM 插件 chunk 中。

## 10. 阶段 8：按需求扩展

只有需求和证据明确后再评估：

- EPUB fixed-layout 更完整的 spread、SVG 和复杂文字排版；
- EPUB media overlays、可靠 MathML、注音和可访问性增强；
- 全文搜索、书签和同一实例内阅读位置；
- Kobo/Apple/DAISY 派生格式；
- LIT、LRF、RB、TCR、TomeRaider 等历史格式；
- KFX 的未加密、可合法解析子集；
- 可选择文本的 DjVu 层和 CHM 全文索引。

不规划编辑、批注写回、格式转换、跨设备同步、云端书架或 DRM 绕过。

## 11. 每阶段共同门禁

- 更新架构、格式清单、支持矩阵、Manifest、注册、格式内容页和真实能力文案；
- 固定样例来源、许可证、生成方式、哈希和关键参数可审计；
- probe 有界且不导入完整 parser、renderer、Worker 或 WASM；
- parser/decoder 版本精确锁定，源码构建资产遵守第三方源码构建规范；
- 书内脚本、网络、表单、导航、外部实体、路径逃逸和压缩炸弹安全测试通过；
- opening/active abort、错误、连续切换、重复 dispose 和 DOM 所有权测试通过；
- 真实浏览器验证目录、顺序、排版/页面、键盘、resize 和资源释放；
- 记录文件、展开、章节/页、DOM、图片、字体、内存、首屏和滚动性能；
- `pnpm test`、`pnpm lint`、`pnpm build` 全部通过；
- 构建门禁确认新增实现只进入对应延迟 chunk，达到资产体积门槛时完成外部链路与回退验证。
