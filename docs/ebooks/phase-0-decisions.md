# 阶段 0：证据与实现决策

2026-09-05。阶段 0 的首批交付门禁已通过；实际阅读交付为 EPUB 2/3 reflowable 与 CBZ。当时 FB2 只有固定语料；阶段 3 的实现与预算增量见 [验证记录](verification.md#阶段-3fb2-与共享阅读层)。MOBI、DjVu、RAR/7z、CHM 没有浏览器阅读实现，保持 planned/blocked。

## ZIP 读取边界

原 `archive/zip-adapter.ts` 只给 zip.js 提供中央目录/尾记录的合成 reader，用于元数据检查，不能解压正文。提取已有 `readDirectoryLayout` 到 `zip-layout.ts`，原归档行为保持不变，原有 76 项测试全部通过。

新增两个窄子入口：

- `@anyfile/archive-metadata-viewer/zip-catalog`：有界读取 ZIP/ZIP64 索引，验证数量、路径与重复条目；不导入 zip.js、DOM 或图片实现。
- `@anyfile/archive-metadata-viewer/zip-source`：复用精确锁定的 `@zip.js/zip.js@2.8.60` 的 `zip-core-custom`；使用浏览器原生 Stored/Deflate 路径，按 entry 输出到有界 WritableStream，校验 CRC、实际展开量并接收 AbortSignal。没有 zip.js Worker/WASM 和额外下载。

`zip-source.test.ts` 实际解压固定章节，检查不调用原文件 `arrayBuffer()`、ZIP64、加密、重复路径、遍历、展开上限、取消与重复销毁。索引和解压都不写文件系统。图片复用 `browser-image-viewer/decode`；静态 AVIF 的 `ispe` 尺寸检查补在共享图片探测器，漫画不另建图片解码栈。

## EPUB.js 与自有 parser

选择窄 OPF/nav/NCX parser + 安全内容重建 + iframe，未采用 EPUB.js。对照源码/版本/哈希见 [dependency-spike.json](evidence/dependency-spike.json)。

| 比较项 | 本次实现 | EPUB.js 0.3.93 |
|---|---|---|
| 依赖 | 已有 zip.js、浏览器 DOM/CSS/图片 | JSZip、lodash、core-js、localforage 等 |
| 压缩包 | 索引 + 当前/邻近 entry | archive 模块调用 JSZip `loadAsync`，不满足本项目的文件切片边界 |
| 安全 | 元素/属性/CSS 白名单、只重写容器资源、CSP、无脚本 sandbox | 默认禁脚本，但并不替代资源清理、网络限制和本项目安全测试 |
| 包体积 | 完整 EPUB 动态入口约 46.3 KiB gzip，含实际共享依赖 | `dist/epub.min.js` 223,875 bytes / 63,569 gzip bytes；不包含另行装载的 JSZip；npm tarball 大小不是浏览器体积 |
| 能力取舍 | 滚动、目录、内部链接、文字设置；明确限制 CSS/布局 | 分页、CFI、标注等更宽能力，本项目首期不使用 |

上游源码快照有 2026-03-24 提交，不能简单称 EPUB.js “无人维护”。拒绝依据是本项目的读取、资源和功能边界，不是该项目不可用。

## 内容隔离决策

原规划同时要求 opaque-origin iframe、完全不执行脚本、父页面处理内部章节跳转/高度/阅读位置。这三个条件不能直接同时实现：opaque-origin iframe 阻止父页面读取正文 DOM；脚本桥又需要开启脚本。

本次改为 `sandbox="allow-same-origin"`，**不授予 allow-scripts**，内容只由父页面的受信代码重建和操作。不会把 `allow-scripts` 与 `allow-same-origin` 组合使用。

防线包括：

- XML 拒绝 ENTITY/内部 DTD；普通外部 DOCTYPE 声明在解析前删除，不加载外部 DTD；章节/树深/节点数有上限。
- 不将原始 HTML 放进宿主；只复制允许的元素和属性。脚本、表单、iframe、object、事件属性、SVG 主动元素均移除。
- 样式使用 CSSOM 解析后重建白名单；不保留 `@import`、任意 URL、自定义属性、越界定位。字体只允许明确的容器内 `@font-face`。
- iframe 文档最先插入 CSP：`default-src 'none'`、`script-src 'none'`、`connect-src 'none'`、`frame-src 'none'`、`object-src 'none'`、`form-action 'none'`；图片/字体只允许本实例 blob URL。
- 所有可用链接被改为内部编号，由父页面阻止默认导航并按已校验 spine/fragment 跳转；外链不启用。
- 三章窗口卸载即移除 iframe、observer、DOM 事件所属文档和 URL；漫画最多四页窗口，离屏图片及 URL 被撤销。

生产隔离页面中测试了恶意 EPUB、强行向清理后的 iframe 添加攻击脚本、宿主标记、网络记录和快速切换；攻击标记保持 0，远程请求为 0。证据见 [browser.json](evidence/browser.json) 和 [浏览器验收脚本](../../scripts/verify-ebook-browser.mjs)。自动化浏览器的 privileged `evaluate` 不用于证明书内脚本有/无宿主权限。

## 重型候选的停止门禁

这里明确调整原阶段 0 的顺序：先取得合法可检查的样例、审计许可和读取架构；未决定采用的 decoder 不为完成表格而生成运行资产。浏览器 Worker/WASM 构建、峰值内存、取消和完整正文测试仍是阶段 4–7 的前置门禁，不能把本次源码/原生 spike 当成这些测试已通过。

| 候选 | 已取得的证据 | 决策与未通过门禁 |
|---|---|---|
| libmobi | 固定提交、LGPL 文本；PalmDOC 无压缩/压缩、Huff/CDIC；MOBI7 + KF8 联合样例的 record/header 检查 | planned。需要单独完成 LGPL 分发/可替换模块方案、WASM 构建和可取消 Worker；本次未编译、未测浏览器峰值内存 |
| DjVu.js | 固定提交、bundled DjVu 样例签名；核对 `LICENSE.md` | blocked on distribution decision。`library/src` 是 GPL-2.0-or-later，根目录其他部分的 Unlicense 不适用于 decoder；尚未形成兼容项目分发的方案，不把解码库放入应用 |
| libarchive | 固定提交、逐文件许可证要求；RAR4、RAR5 Stored、7z Copy 样例在系统 bsdtar 中可列目录 | planned。BSD 许可本身不是阻碍，但原生列目录不证明浏览器随机跳页/固实解压/取消；ZIP 已有更窄实现，裁剪 WASM 留给阶段 5 |
| CHM / libmspack | 固定提交、LGPL 文本、ITSF 反例样例与哈希 | planned。只有格式/反例输入，尚无正常 topic 阅读验收和 LZX Worker；不声明 CHM 阅读支持 |

远程样例只下载到系统临时目录供研究，没有把未知书籍内容再分发到仓库。URL、提交、原始/解码后哈希、原生工具结果全部保存在 [dependency-spike.json](evidence/dependency-spike.json)，可用 `python3 scripts/spike-ebook-dependencies.py` 重跑。没有候选重型依赖进入 package.json、probe、首包或运行资产目录。

## 资源预算与测量口径

预算以解压前的容器校验、解压流中的实际计数和解码前的图片元数据检查执行。不是仅在浏览器报 OOM 后捕获异常。

| 资源 | 初始上限 |
|---|---:|
| 原 ZIP 文件 / 中央目录 / entries | 2 GiB / 4 MiB / 10,000 |
| 单归档 entry / 声明总展开量 / 压缩比 | 32 MiB / 2 GiB / 1000:1 |
| EPUB package/XML/章节 | 2 MiB；最多 2,000 个线性章节 |
| XML 结构 | 深度 64；节点计数预算 20,000（含子节点计数，保守计数） |
| 每章 CSS | 单份 256 KiB，累计 1 MiB，每份 2,000 规则 |
| 每章资源 / 字节 / 像素 | 64 个 / 32 MiB / 1,600 万像素；最多当前及前后共 3 章 |
| 字体 | 每章最多 8 个，每个 4 MiB |
| CBZ 页面 / 每页编码字节 | 5,000 / 16 MiB |
| CBZ 像素 / 活跃窗口 | 每页 800 万；单页/连续最多 3 页，双页最多 4 页 |
| 动画 | GIF/WebP/APNG 将帧数计入像素预算；缺少有界帧数的动画 AVIF 不进入阅读路径 |

四张 800 万像素页按 RGBA8 估算最多约 122 MiB 基础像素，单页预取约 92 MiB；这不包含浏览器解码器内部内存和 GPU 副本。EPUB 的资源预算同样不是浏览器总内存的硬保证。静态 AVIF 按 HEIF `ispe` 属性取得保守输出尺寸；损坏码流仍由原生 decoder 判错。

2026-09-05 的 Chromium 145 / macOS / localhost 生产构建样本：EPUB 首 UI 55 ms（正文和图片断言完成 108 ms），300 页 CBZ 首 UI 27 ms，800 万像素双页读入 78 ms、4 个活跃 URL、当时 JS heap 16,184,337 bytes。JS heap **不包含原生图片内存**；这些是固定合成样例的初始基线，不是所有书籍的性能承诺。完整原始数据见 `evidence/browser.json`。

超大像素、33 MiB entry、10,001 entries、重复/逃逸路径、过深 XML、缺失 spine/可选图片、加密归档均有固定反例。重型候选没有运行时，所以 Worker/WASM 内存、初始化、取消指标记录为未测，不能填 0。
