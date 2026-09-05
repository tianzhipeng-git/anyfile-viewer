# 阶段 0–5 验证记录

## 阶段 0–2 基线

2026-09-05，Node.js 24.4.0、pnpm 10.32.1、Chromium 145.0.7632.6，macOS；浏览器使用 `next build --webpack` 后的生产服务。

- `pnpm test`：742 项通过，包含新增 EPUB、CBZ、ZIP 源、AVIF 尺寸与归档备选竞争测试。
- `pnpm lint`：通过。
- `pnpm build`：通过；`/en/view` 首包 214.5 KiB gzip，预算 225 KiB。
- EPUB probe 2,637 bytes gzip，完整入口 47,418 bytes gzip；CBZ probe 2,651 bytes，完整入口 44,933 bytes。入口统计包含真正引用的共享 chunk。
- 构建门禁检查两种阅读器各自的动态入口；probe 不包含 reader/解压实现，EPUB 不包含漫画视图，漫画不包含 EPUB 视图；无新增 Worker/WASM 资产。
- 生产浏览器 15 组验收通过，0 个攻击域请求、0 个未捕获 pageerror；见 [原始结果](evidence/browser.json)。

## 覆盖范围

1. 英文、中文首页真实点击进入查看页，`crossOriginIsolated === true`。
2. 本地文件入口、专用阅读器默认选择、归档低等级备选。
3. EPUB 2 NCX、EPUB 3 nav、五章 reading order、LTR/RTL。
4. 目录跳转、跨章节 fragment、字号/行高/宽度/主题、窄/矮窗口与当前位置。
5. 内嵌 TTF 字体、PNG、SVG；缺失可选图片保留正文与局部说明。
6. 书内脚本、事件、表单、iframe、object、远程 CSS/资源、顶层导航入口清理；iframe 中攻击脚本无法执行。
7. XML 外部实体、深度、缺失 spine、DRM、归档数量/大小/压缩比和路径反例。
8. CBZ ZIP/ZIP64、自然数字路径、封面单页、奇偶页、ComicInfo 双页/RTL、键盘导航。
9. JPEG、PNG、GIF、WebP、静态 AVIF 使用已有原生图片解码器。
10. 300 页文件按需加载、跳至 250 页、连续滚动、缩放、窗口 resize 和离屏释放。
11. 800 万像素图片的四页窗口测量、超大像素与损坏图片的局部错误。
12. 文件切换后所有书籍 blob URL 和 iframe 释放；单元测试覆盖 opening/active abort、幂等 dispose、宿主 DOM 所有权、无迟到进度。

截图：[EPUB 窄窗口](evidence/epub-narrow.png)、[安全正文](evidence/epub-safe.png)、[RTL 漫画](evidence/comic-rtl.png)、[漫画窄窗口](evidence/comic-narrow.png)。

## 重跑

```sh
pnpm fixtures:ebooks
pnpm test
pnpm lint
pnpm build
pnpm exec next start --port 3107
# 在另一个终端运行；首次使用 Playwright 时安装 Chromium：pnpm exec playwright install chromium
EBOOK_TEST_URL=http://localhost:3107 pnpm test:ebooks:browser
```

如复用已经安装的 Chromium，可以设置 `CHROMIUM_PATH` 为该可执行文件的绝对路径。浏览器脚本会重写本目录的 JSON/截图。固定样例源码和哈希见 [fixtures/manifest.json](fixtures/manifest.json)；候选上游审计用 `python3 scripts/spike-ebook-dependencies.py` 重跑。

当前 verified 只覆盖上述组合与 Chromium 版本；不宣称 EPUB 标准完整合规、所有 CSS/字体变体、竖排/MathML、fixed-layout、受保护或混淆字体、AVIF 动画、MOBI/DjVu/CHM 已验证。后续浏览器和真实大型出版物仍需在相应变体进入声明范围前补证据。

## 阶段 3：FB2 与共享阅读层

2026-09-05，沿用 Node.js 24.4.0、pnpm 10.32.1 和 Chromium 145.0.7632.6，使用本地产生的生产构建。重跑命令与上文一致。

- `pnpm test`：762 项通过；`pnpm lint` 与 `pnpm build`：通过。生产浏览器 18 组验收通过，0 个攻击域请求、0 个未捕获 pageerror。
- `/en/view` 首包 214.7 KiB gzip（预算 225 KiB）；EPUB 完整入口 47,717 bytes gzip；FB2 probe 3,057 bytes、完整入口 46,671 bytes，包含实际引用的共享 chunk。详见 [bundle.json](evidence/bundle.json)。
- 新增 `fictionbook-reader` 的原始 FB2 内容 probe、`.fb2.zip` 复合扩展名与普通 ZIP 单主 FB2 索引识别。probe 原始头最多 8 KiB；ZIP 使用已有 5 MiB 索引读取预算，目录候选不解压正文；open 完整验证 XML。多书归档不被接管，归档等级 2 保留为手动备选。
- 18 项 FB2 单元测试覆盖编码、元数据、目录、脚注链接、诗歌/表格、按需资源与清理、无效 XML、DTD/实体、深度、巨大 binary、非法 base64、重复 ID、章节/文件超限、无 ID 嵌套章节、缺失封面与取消。happy-dom 不解析 XML 属性命名空间，单元测试仅修正其测试 DOM；真实 Chromium 使用原生命名空间解析，不经过修正。
- EPUB 与 FB2 的生产浏览器测试验证各自打开时不下载对方独有的完整实现 chunk。构建门禁也检查共享包不带入另一个格式 parser；无新增第三方运行时、Worker 或 WASM。
- 浏览器覆盖 PNG 封面、多个 body、嵌套目录、诗歌与表格、脚注跨窗口跳转并在原章节卸载后返回、排版、窄/矮窗口、两种语言、UTF-16 LE/BE 与 Windows-1251、两种 ZIP 文件名、主动内容和文件切换释放；同时回归 EPUB/CBZ。原始时序、资源数、heap 与安全结果见 [browser.json](evidence/browser.json)，截图见 [FB2 窄窗口](evidence/fb2-narrow.png)。
- 共享视口只在目标 iframe 完成初始化后恢复内部锚点，避免相邻章节加载事件抢先消耗定位；脚注返回的自动 ID 在章节重新加载后保持稳定。短脚注章节至少填满阅读视口，字号变化以文本块而非整章 section 为定位单位。

### FB2 资源边界与取舍

| 项目 | 当前执行上限 |
|---|---:|
| 原始/展开 FB2 XML | 32 MiB |
| XML 结构 | 深度 64，100,000 保守节点计数 |
| 章节与目录 | 各 2,000；顶层 section 为加载单位，嵌套 section 为目录 anchor |
| 单章节 | 2 MiB 正文/最终 HTML，20,000 映射节点 |
| 图片 binary | 单张最多 8 MiB；base64 长度在解码前校验 |
| 每章图片 | 32 个，16 MiB 累计编码字节，1,600 万累计像素（动画计入帧数） |
| 活跃窗口 | 当前及前后最多三章，卸载立即撤销 URL |

全部 XML 在上述输入预算内由浏览器 DOMParser 同步解析并保留 DOM；这不是流式 XML 或可中途终止的 Worker parser。取消覆盖文件读取后的异步边界和逐章 HTML 映射；映射每 256 节点让出事件循环。图片在章节需要时才从 base64 解码，未预解码整本书；销毁后清空 XML/资源索引。单元测试与固定样例只证明声明子集，不代表所有传统编码、SVG binary、复杂排版或大书极限已验证。

三章的像素预算最多约 183 MiB RGBA8 基础像素，另加 XML DOM、编码字节和浏览器内部副本；JS heap 指标不包含原生图片/GPU 内存，预算不是浏览器总内存硬保证。PNG 封面有直接 FB2 浏览器证据；其他原生图片通过已有图片检查/浏览器解码能力实现，尚未为 FB2 逐组合验收。

## 阶段 4–5

2026-09-05，Node.js 24.4.0、pnpm 10.32.1、Chromium 145.0.7632.6，macOS arm64。以下新增记录覆盖前文阶段 0–3 的历史状态；当前范围以 [支持矩阵](support-matrix.md) 和 [实际方案](phase-4-5-decisions.md) 为准。

- `pnpm test`：**788 项通过**；`pnpm lint`：通过，无警告；`pnpm build`：通过，包含插件加载与运行资产门禁。
- 新增生产浏览器 **29 组验收通过**；原 EPUB/FB2/CBZ **18 组回归通过**。两套脚本均为 0 个攻击域请求、0 个未捕获 pageerror。原始结果：[阶段 4–5](evidence/phase45-browser.json)、[既有格式回归](evidence/browser.json)。
- `/en/view` 首包 **215.0 KiB gzip**，仍低于 225 KiB 上限。MOBI probe **716 bytes gzip**，初始 viewer 入口 **11,376 bytes gzip**；漫画 probe **3,335 bytes**，初始 viewer 入口 **45,587 bytes**。这是构建报告中的初始动态入口集合；后续 Worker 和 native 模块另计，不能把入口大小当作全部冷启动传输量。
- native 模块：libmobi JS + WASM **50.3 KiB gzip**（WASM 原始 103,836 bytes）；漫画 JS + WASM **79.0 KiB gzip**（WASM 原始 173,586 bytes）。低于 2 MiB 单资源 / 4 MiB 冷启动门槛，使用版本化同源资产。普通 ZIP/TAR 的浏览器测试断言不初始化或请求漫画 native decoder；MOBI 与漫画 parser 不进入彼此 probe 或 `/view` 首包。
- 在两个独立临时目录从锁定源码重建，四个 JS/WASM 文件均逐字节一致：[重建证据](evidence/decoder-reproducibility.json)。运行产物、源码/adapter/许可和哈希由 `prepare:ebooks` 校验；没有把构建工具加入应用安装、test 或 build 流程。

### 新增组合与交互证据

1. 自有 Calibre 样例的 MOBI7 PalmDOC 压缩、无压缩、Huffman、KF8、MOBI7/KF8 联合文件，验证正文、图片、五项目录、排版设置与资源释放。
2. 联合文件有多 KF8 part，末章正文没有重复；MOBI7 空分页标记后的章节保留，目录可进入后续 anchor。
3. 原始和压缩 PalmDOC 的 Windows-1252 `café`、纯文本显示；任意 PDB 和极端 record count 不进入 decoder。
4. 从 raw MOBI 注入的脚本、事件、iframe、form、远程图片和外部导航被清理；验证真正未经 Calibre 清理的恶意输入。MOBI 原始 HTML 用 inert template 解析；PalmDOC 的 `<script>` 字样按文本保留。
5. DRM / RAR 文件加密 / RAR5 头部加密显示稳定不支持状态；循环 Huffman、重叠 offset、text 长度超限、重复路径、截断归档被拒绝。
6. CBT USTAR、RAR4 Stored、RAR5 Stored/固实、7z Copy/LZMA/LZMA2，验证自然顺序、页码、RTL、双页、键盘、窄窗口和跳到第 250 页。
7. 同一个文件的最多四页图片 URL 窗口、文件切换后的 0 Worker/iframe/URL；打开期间阻断模块初始化后取消、快速交替 MOBI/漫画并销毁。单元测试另外覆盖并发页请求中取消一页、超时终止以及重复 dispose。
8. 英文和简体中文 UI、WASM MIME 与 immutable 缓存响应。截图：[KF8 窄窗口](evidence/mobi-narrow.png)、[固实漫画窄窗口](evidence/solid-comic-narrow.png)。

### 测量与边界

最终合成样本运行中，KF8 和联合文件各自“打开 + 图片/目录断言 + 排版设置 + 关闭”约 **53 ms**；300 页固实 RAR5 的“打开 + 跳页/方向/双页 + 窄窗截图 + 关闭”约 **78 ms**，LZMA2 7z 对应交互约 **46 ms**。这些是各验收步骤总时长，**不是单独首屏时间**，也不是性能承诺。

MOBI/KF8 的 WASM 在样例中保留 16 MiB memory；300 页 RAR5 为 16 MiB，LZMA2 为 20,185,088 bytes。两种 300 页压缩样例展开的编码资源仅 65,100 bytes，证明的是固实读取/缓存/页数行为，不能据此声称大书峰值内存或展开极限已被实测。原生内存增长上限均为 256 MiB；仍须另加输入/输出 JS 副本、DOM 和图片/GPU。JSON 中主线程 heap 与 decoder memory 分开记录。

RAR4 的其他压缩组合、任意复杂 KF8 出版物、PAX/GNU TAR、7z 其他算法、其他浏览器没有在本阶段被标为 verified。MOBI 的等级保持 3，输入/part 限制和重建成本已公开，未把控件数量当作完整 Kindle 支持。

### 重跑

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm build
pnpm exec next start --port 3107
# 另一个终端
EBOOK_TEST_URL=http://localhost:3107 pnpm test:ebooks:browser
EBOOK_TEST_URL=http://localhost:3107 pnpm test:ebooks:phase45
```

普通测试使用已经入库的自有样例，不需要 Calibre/RAR 或网络。需要重建样例时见 [语料说明](fixtures/phase45/README.md)；需要重建 WASM 时见 [构建配方](../../tools/ebook-decoders-build/README.md)。这些生成流程与应用构建分离。
