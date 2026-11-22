# PostScript 查看器 (`postscript-document`)

在浏览器本地解释并栅格化 PostScript、EPS 和旧版 Illustrator 图稿。

## 基本介绍

- **插件 ID**：`postscript-document`
- **格式入口**：`.eps`、`.epsf`、`.epsi`、`.ps`、`.ai`
- **能力**：PS/EPS 文档页面预览；兼容 PDF 的 `.ai` 由 PDF.js 插件通过签名识别处理。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 做 4 KiB 有界探测，检查 PostScript DSC 或 DOS EPS 头；`.ai` 与 `pdfjs-pdf` 并发探测，PDF 签名由 PDF.js 以等级 4 命中，PostScript DSC 头由本插件以等级 3 命中。
2. 解释器和栅格器位于独立可销毁模块 Worker，使用源码构建、锁定 `stet v0.8.1`（Apache-2.0 OR MIT，仅启用 PS/EPS，不含可选 PDF reader）的 `stet-wasm`（`/vendor/stet/0.8.1-anyfile.1/`，约 10.3 MiB gzip；配方见 [tools/stet-wasm-build](../../../tools/stet-wasm-build/)，`pnpm prepare:stet` 校验复制）。
3. 自建运行时按 `R2 (assets.anyfile.top) → 同版本同源` 加载，不使用 jsDelivr；仅资产获取、Worker 创建或引擎初始化失败时销毁旧 Worker 并切换下一来源，文件解释或栅格化错误不触发整套运行时重试。
4. 打开时先解释首页并返回尺寸，翻页时在 Worker 内按需发现后续页面。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/runtime-assets` | 锁定版本的运行时资产加载与来源回退 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

运行时资产不作为普通 npm 渲染库直接导入；部署需提供锁定版本的 stet-wasm 及其许可证。

## 已知限制

- 输入最大 128 MiB、单次 Canvas 渲染最多 1600 万像素、单次初始化/解释/栅格化最多 20 秒（超时直接终止 Worker 防无限循环）。
- 浏览器 WASM 无法使用系统字体，未内嵌字体由 stet 内置 URW 度量兼容字体替代；不自动获取文档引用的远程文件或字体，按主要内容等级 3 提供查看。
- 不提供文本选择、矢量编辑、打印、格式转换或 Illustrator 完整文档语义。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/postscript
```
