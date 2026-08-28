# Browser image viewer

阶段 1 的浏览器原生栅格插件，支持 JPEG、PNG/APNG、GIF、WebP 和 AVIF。实现使用 `<img>` 与 Object URL，浏览器负责动画、EXIF orientation 和可用的色彩管理；插件不创建 Canvas 像素副本。

## 读取与资源策略

- 原生 `<img>` 路径不设置固定的文件大小、像素、帧数或估算内存上限，实际可解码容量由当前浏览器和设备决定。
- 插件只读取前 1 MiB 用于格式和基础元数据识别，再把原始 `File` 的 Object URL 交给浏览器；不会在 JavaScript 中复制完整编码文件或创建 RGBA 像素副本。
- 超过头部读取范围的动画不展示可能不完整的帧数统计。
- AVIF 图像序列不在阶段 1 的声明范围内，因此 probe 仍拒绝 `avis`。

## 验收约定

- `probe` 只做有界格式识别，不创建 Object URL，也不执行完整文件解码或导入完整查看器。
- `open()` 重新检查有界文件头，并通过真实 `<img>` decode smoke test 后才挂载 UI。
- 协议测试覆盖 opening abort、active abort、重复 dispose、容器 DOM 所有权和 Object URL 释放。
- `examples/` 中的样例由仓库脚本生成，不包含第三方素材。
