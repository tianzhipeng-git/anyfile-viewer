# 代码与文本查看器 (`ace-code-text`)

基于 Ace Editor 的源代码与纯文本只读高亮预览插件。

## 基本介绍

- **插件 ID**：`ace-code-text`
- **支持格式**：100+ 扩展名（`.js`、`.ts`、`.py`、`.md`、`.json`、`.yaml` 等）及特殊文件名（`Dockerfile`、`Makefile`、`.env` 等）
- **能力**：语法高亮、行号、内置搜索框（`ext-searchbox`）
- **MIME 匹配**：`text/*`、`application/json`、`application/xml`、`application/javascript`

## 实现原理

1. **打开流程**（`src/index.ts`）
   - 文件大小上限 256 MiB
   - 流式读取 + `TextDecoder` 解码为字符串（默认 UTF-8）
   - 按文件名映射 Ace mode（`src/modes.ts`）

2. **编辑器初始化**（`ace-builds`）
   - 动态 import 对应 `mode-{name}.js` 和 `ext-searchbox`
   - `ace.edit(root)` 创建只读编辑器
   - 关闭光标、活动行高亮、Worker 校验（`useWorker: false`）
   - 不自动换行（`wrap: false`）

3. **样式**
   - 注入 CSS 适配 viewer 主题变量（背景、前景、边框、选中色）
   - gutter 行号区使用半透明背景

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议 |
| `ace-builds@1.44.0` | 代码编辑器与高亮 mode |

Mode 文件按需动态加载，不一次性打入首包。

## 已知限制

- 256 MiB 文件大小硬上限；超大文件整文读入内存
- 默认 UTF-8 解码，非 UTF-8 编码（GBK、Latin-1 等）可能乱码
- 只读预览，不可编辑
- 未知扩展名回退到 `plain_text`，无高亮
- 关闭 Ace Worker，JSON 等语法的实时校验不可用
- 不自动换行，超宽行需横向滚动
- CSV/TSV 在此插件与 excel / data 插件间可能冲突，由宿主注册优先级决定
- Markdown 仅语法高亮，不渲染为 HTML
