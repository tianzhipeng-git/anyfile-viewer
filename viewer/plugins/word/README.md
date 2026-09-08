# Word 查看器 (`word-document`)

在浏览器中预览 Office Open XML 格式的 Word 文档（`.docx`）。

## 基本介绍

- **插件 ID**：`word-document`
- **支持格式**：`.docx`（`application/vnd.openxmlformats-officedocument.wordprocessingml.document`）
- **能力**：将 DOCX 排版为 HTML 并在页面中只读展示
- **示例文件**：`examples/demo.docx`
- **不支持**：旧版 `.doc`（二进制）、`.odt`、宏文档

## 实现原理

1. **打开流程**（`src/index.ts`）
   - 文件大小上限 30 MiB
   - 校验 ZIP 魔数（`PK\x03\x04`），DOCX 本质为 ZIP 包
   - 流式读取整个文件到 `ArrayBuffer`

2. **渲染**（`docx-preview`）
   - 调用 `renderAsync(bytes, documentHost, generatedStyles, options)`
   - 将 WordprocessingML 转为 DOM 节点，样式注入 `generatedStyles` 容器
   - 关闭修订/批注/AltChunk 渲染（`renderChanges: false` 等）

3. **安全处理**
   - 遍历生成链接，移除非 `http(s)/mailto/tel` 协议的 `href`，防止 `javascript:` 等 XSS
   - 为外链添加 `rel="noreferrer noopener"`

4. **UI**
   - 粘性工具栏显示文件名 + 文档滚动区域
   - 灰色背景模拟纸张效果

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `docx-preview@0.4.0` | DOCX 到 HTML 的只读排版 |

## 已知限制

- 仅 `.docx`，不支持 `.doc`、`.rtf`、`.odt`
- 30 MiB 文件大小硬上限
- 复杂排版（分栏、文本框、SmartArt、嵌入 OLE 对象）可能丢失或错位
- 不渲染修订记录、批注、脚注/尾注的完整交互
- 字体呈现依赖文档内嵌字体和浏览器可用字体；所需字体不可用时会发生字体回退
- 整文件读入内存，大文档受浏览器内存限制
- 只读预览，不可编辑或导出

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/word-viewer test
```
