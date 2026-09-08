# Source Map 查看器 (`dev-source-map-viewer`)

解析 Source Map v3，查看源文件、映射条目并查询生成位置对应的源位置。

## 基本介绍

- **插件 ID**：`dev-source-map-viewer`
- **格式入口**：`.map`
- **能力**：基础及内嵌 indexed source map、sourcesContent 预览、ignoreList 标记和位置查询。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/parser.ts](src/parser.ts) 完整读取受限大小的 UTF-8 JSON，检查 version、sources、names 和 sections。
2. 解码 Base64 VLQ mappings，累加源位置和名称索引，并应用 section 偏移后排序。
3. [src/ui.ts](src/ui.ts) 以文本展示源码和映射；外部 section URL 只记为警告，不发起请求。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/dev-binary-core` | 二进制游标与有界文件读取 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

解析为项目内实现，无第三方 Source Map 库或 WASM。

## 已知限制

- 输入最大 32 MiB；最多 100 万映射、10 万源文件、20 万名称，indexed 嵌套深度上限 8。
- 仅支持 version 3；没有 sourcesContent 时不会从网络或本地工作区补取源码。
- 整份 JSON 与映射驻留内存；不提供调试执行、断点或代码编辑。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/dev-source-map-viewer test
```
