# EPS 与 PostScript 查看架构

## 1. 能力边界

`postscript-document` 独立插件负责 `.eps`、`.epsf`、`.epsi`、`.ps`，以及带 PostScript DSC 文件头的旧版 `.ai`。它返回支持等级 3：可以展示主要页面内容、翻页和固定档位缩放，但不承诺打印机专用操作符、系统字体、外部资源或完整色彩工作流与原应用一致。

现有 `pdfjs-pdf` 不承担 PostScript 能力。两个插件都声明 `.ai`，宿主并发运行 probe：PDF 签名由 `pdfjs-pdf` 以等级 4 命中，PostScript DSC 文件头由 `postscript-document` 以等级 3 命中；无法识别的 AI 才降级到十六进制查看器。

## 2. 引擎决策

采用 stet v0.8.1 的默认 `stet-wasm` 构建：

- Apache-2.0 OR MIT，与项目许可证兼容；
- 纯 Rust PostScript Level 3 解释与 Canvas 所需 RGBA 栅格输出；
- 支持 EPS BoundingBox、DOS EPS 头和多页 PostScript；
- 默认 WASM 构建不暴露可选 PDF reader 路径。

没有采用 Ghostscript WASM，因为可用构建使用 AGPL-3.0，不能在当前 Apache-2.0 产品中直接组合分发。没有复用 PDF.js，因为它没有 PostScript 解释器。没有只提取 EPS TIFF/WMF preview，因为 preview 是可选且质量不一致，不能兑现一般 EPS 查看能力。

上游把浏览器构建定位为 capability sampler，并明确指出单线程性能和字体替代限制，因此本项目保守声明等级 3，并将验证状态保持为 pending，直到积累可再分发的真实 EPS/PS 样例矩阵。

## 3. 运行流程

```text
扩展名命中 .eps/.epsf/.epsi/.ps，或 .ai 同时成为 PDF/PostScript 候选
  → 4 KiB 有界 probe 检查 DSC 或 DOS EPS 头
  → 动态加载完整插件
  → 读取不超过 64 MiB 的本地文件
  → 创建一次性模块 Worker
  → Worker 按需加载版本化 stet glue/WASM
  → 解释首个页面并返回页面尺寸
  → 当前页面按 Canvas 尺寸栅格化
  → 用户点击下一页时，在 Worker 中按需发现后续 PS 页面
```

PostScript 是可编程语言。解释器只能在 Worker 中运行；单次初始化、解释或栅格化超过 20 秒时主线程终止 Worker。单次 Canvas 输出不超过 1600 万像素。插件销毁或宿主取消时同样直接终止 Worker，因此无限循环不能冻结页面主线程或跨文件存活。

## 4. 资产与构建

源码锁定在 stet v0.8.1、commit `a61c70796f25e0d0a8f5eaa04992cb7cd222aa07`，release archive SHA-256 为 `78a1140a4fad3862325f04402e746f590b4fb82664127e9416d97a2052be0510`。可重复配方位于 `tools/stet-wasm-build/`，审核产物位于 `third_party/stet-wasm/0.8.1-anyfile.1/`，`pnpm prepare:stet` 校验后复制到 `/vendor/stet/0.8.1-anyfile.1/`。

WASM 为 13,600,486 bytes，gzip 约 10.3 MiB，超过外部资产门槛。当前保留同源分发例外，让模块 Worker、动态 glue、WASM 和 `/view` 的 COEP/CORP 行为先形成一个可验证发布边界。运行时只在插件选中后加载，不进入查看页首包、probe chunk 或其他插件 chunk。上线流量扩大前应把相同哈希发布到 `assets.anyfile.top`，完成 Chrome、Edge、Firefox、Safari 的跨源模块与 WASM 验证后切换成 R2 → 同源回退。

## 5. 已知限制与验证

- 浏览器无法读取系统字体；未内嵌字体使用 stet 内置的 URW 度量兼容字体替代。
- 不自动获取文档引用的远程文件、字体或其他资源。
- 复杂 PostScript 的解释或重绘可能触发时间上限。
- 当前不提供文本选择、打印、转换、导出或调试功能。
- 发布前需用普通 EPS、DOS EPS、带图片/字体 EPS、多页 PS、损坏文件、无限循环和超限文件做真实浏览器验收。
