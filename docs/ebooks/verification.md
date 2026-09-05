# 阶段 0–2 验证记录

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
