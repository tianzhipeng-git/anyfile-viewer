# 阶段 0–3 验证记录

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
