# 字体查看器 (`font-viewer`)

在浏览器本地预览 TrueType / OpenType 与 WOFF / WOFF2 字体：试打预览、字形样本、字体元数据与表目录。

## 基本介绍

- **插件 ID**：`font-viewer`
- **格式入口**：`.ttf`、`.otf`、`.woff`、`.woff2`
- **能力**：12–96 px 试打预览、可编辑示例文本、字形样本、家族/样式/版本/字重/字形数量、表目录。
- **数据处理**：文件在浏览器本地只读处理，不上传，也不安装到系统字体列表。

## 实现原理

1. [src/probe.ts](src/probe.ts) 只读取前 64 KiB，交给 [src/directory.ts](src/directory.ts) 校验 sfnt / WOFF / WOFF2 头部与表目录；probe 不读取表数据。
2. [src/metadata.ts](src/metadata.ts) 在完整读取后解析 `name`、`head`、`maxp`、`OS/2` 表；WOFF 的表先按 zlib 解压再解析。
3. [src/index.ts](src/index.ts) 用 `FontFace` 在内存中加载字体，交给 [src/ui.ts](src/ui.ts) 渲染试打预览与信息面板，销毁时从 `document.fonts` 移除。
4. 渲染只使用 `textContent` 与插件私有 class，跟随宿主主题变量。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

不需要第三方运行时或 WASM；字体解码由浏览器自身完成。

## 已知限制

- 仅预览，不安装、不编码转换、不做子集化或提取。
- 输入上限 32 MiB：`FontFace` 需要整体解码文件。
- WOFF2 的表为 Brotli 压缩且可能经过字形变换，当前只列出表目录，家族名称回退为文件名；`.ttc` 字体集合不在声明范围。
- 渲染结果取决于浏览器与操作系统，不比较 hinting、OpenType 特性差异。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[元数据解析](src/metadata.ts)、[界面](src/ui.ts)、[真实样例](examples/README.md)。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/font
```
