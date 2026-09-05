# PostScript 查看器 (`postscript-document`)

在浏览器本地解释并栅格化 PostScript、EPS 和旧版 Illustrator 图稿。

## 基本介绍

- **插件 ID**：`postscript-document`
- **格式入口**：`.eps`、`.epsf`、`.epsi`、`.ps`、`.ai`
- **能力**：PS/EPS 文档页面预览；兼容 PDF 的 `.ai` 由 PDF.js 插件通过签名识别处理。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 检查 PostScript/EPS 签名及 Illustrator 类型。
2. 解释器和栅格器位于独立可销毁 Worker，使用锁定版本、仅启用 PS/EPS 的 stet-wasm。
3. 运行时优先从固定提交的 jsDelivr URL 加载，失败后尝试同版本 R2 镜像和同源资产；每次初始化失败先销毁原 Worker。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/runtime-assets` | 锁定版本的运行时资产加载与来源回退 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

运行时资产不作为普通 npm 渲染库直接导入；部署需提供锁定版本的 stet-wasm 及其许可证。

## 已知限制

- 输入最大 64 MiB、单次 Canvas 渲染最多 1600 万像素、Worker 操作最多 20 秒。
- 浏览器 WASM 无法使用系统字体；缺失嵌入字体或不支持的 PostScript 运算符可能降低保真度，按主要内容等级 3 提供查看。
- 不提供矢量编辑、格式转换或 Illustrator 完整文档语义。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/postscript-viewer test
```
