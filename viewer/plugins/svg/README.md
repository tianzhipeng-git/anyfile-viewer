# 安全 SVG 查看器 (`safe-svg`)

清理 SVG 的主动内容后，以浏览器图片模式展示矢量图。

## 基本介绍

- **插件 ID**：`safe-svg`
- **格式入口**：`.svg`、`.svgz`
- **能力**：SVG/SVGZ、缩放、旋转、适应窗口，并显示清理结果信息。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/read.ts](src/read.ts) 有界读取 SVG；SVGZ 通过 DecompressionStream 解压 gzip，并限制解压后大小。
2. [src/sanitize.ts](src/sanitize.ts) 解析并清理 SVG，删除危险内容和引用。
3. [src/index.ts](src/index.ts) 将清理后的源文档创建为 Blob URL，以 `<img>` 解码显示；销毁时释放 URL 与交互。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

无第三方 SVG 渲染器或 WASM，读取、清理与展示使用浏览器 API。

## 已知限制

- 编码输入和解压后的内容均不得超过 16 MiB；SVGZ 需要 DecompressionStream。
- 脚本、事件处理及不允许的资源引用会被清理，因此依赖这些特性的图稿可能与原稿不同。
- 以图片方式只读预览，不提供 SVG DOM 编辑或源码编辑；实际图形表现受浏览器 SVG 支持影响。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/safe-svg-viewer test
```
