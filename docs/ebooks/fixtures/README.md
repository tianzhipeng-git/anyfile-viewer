# 固定电子书语料

`pnpm fixtures:ebooks` 从 `scripts/generate-ebook-fixtures.py` 确定性生成正常及恶意 EPUB/CBZ/FB2。文字和纯色 PNG 是本项目原创测试数据，按 CC0-1.0 提供；不包含真实用户图书。ZIP 时间固定，哈希与关键大小/条目参数见 `manifest.json`。

- EPUB：EPUB 2/NCX、EPUB 3/nav、RTL、字体/SVG、缺失图片或 spine、DRM 标记、脚本/外部资源/表单、实体、深 DOM、大章节。
- CBZ：自然排序、嵌套目录、ComicInfo/RTL/跨页、ZIP64、300 页、800 万像素边界、五种原生图片格式、加密、空包、损坏图片、过大像素、重复路径、路径逃逸、展开炸弹、条目超限。
- FB2：正常、外部实体和过深 section。仅阶段 0 语料，没有注册 FB2 阅读器。

`resources.epub` 包含 Abel 字体；`fonts/Abel-Regular.ttf` 来自 Google Fonts 固定提交 `3b99d83d2625944fc0b8bd328d793fa819b92381`，许可证完整保留于 `fonts/OFL.txt`。作者与版权以该文件为准，字体按 OFL-1.1 提供，不能把其许可证写成 CC0。源码 URL 与 SHA-256 记录在 manifest 的 inputs 中。

`image-formats.cbz` 复用 `viewer/plugins/browser-image/examples` 已有原创渐变样例；这些输入、生成脚本和哈希也记录在 manifest。重型格式的上游研究样例只存放于临时目录，不在这里重新分发，见 `../evidence/dependency-spike.json`。
