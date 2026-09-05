# WebAssembly 模块查看器 (`dev-wasm-viewer`)

静态检查 WebAssembly 二进制模块结构，不实例化或执行所选模块。

## 基本介绍

- **插件 ID**：`dev-wasm-viewer`
- **格式入口**：`.wasm`
- **能力**：查看段、函数类型、导入导出、函数体大小、表、内存声明和自定义段摘要。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/parser.ts](src/parser.ts) 使用 `FileByteSource` 与 `BinaryCursor` 按范围读取文件，验证魔数、版本和段顺序。
2. 解析 ULEB、类型与索引；函数体、数据段及部分段内容按长度跳过，不反汇编指令。
3. [src/ui.ts](src/ui.ts) 展示结构信息；读取支持取消，销毁时移除界面和监听器。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/dev-binary-core` | 二进制游标与有界文件读取 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

使用项目内二进制解析工具，不依赖 WASM 执行引擎解析所选文件。

## 已知限制

- 文件最大 512 MiB、最多 256 段；受限向量最多 10 万条，单个字符串最多 64 KiB，累计字符串最多 8 MiB。
- 只支持二进制版本 1 和当前解析器识别的类型；类型段仅接受标准函数类型。
- 不提供 WAT 反汇编、执行、调试或完整规范验证，结构可读不表示模块可运行。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/dev-wasm-viewer test
```
