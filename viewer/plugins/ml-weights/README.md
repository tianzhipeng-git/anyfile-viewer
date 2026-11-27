# 机器学习模型权重查看器 (`ml-weights`)

## 基本介绍

- **插件 ID**：`ml-weights`
- **格式入口**：`.safetensors`、`.gguf`

在浏览器中只读查看模型权重文件的元数据与张量清单：架构、参数量、权重大小、量化类型，以及每个张量的名称、形状、数据类型与体积。只读取文件头，不加载、不下载、不上传数 GB 的权重本体。

## 实现原理

1. `src/probe.ts` 只读前 9 字节做内容探测：GGUF 依据 `GGUF` 魔数（同时支持小端与大端字节序）；safetensors 依据“8 字节小端头长度 + 紧跟 `{`”的头部结构。
2. `src/safetensors.ts`：读取 8 字节小端头长度，再读该长度的 UTF-8 JSON；逐项校验 `dtype`/`shape`/`data_offsets` 并据此计算参数数与字节数。张量数据永不读取。
3. `src/gguf.ts`：解析魔数、版本、张量数与元数据 KV（含字符串、定宽标量与数组摘要），再解析每个张量的名称、维度、类型与偏移；按 `general.alignment` 校验张量数据是否落在文件范围内。量化类型按块映射元素数与每块字节数，估算权重体积。
4. `src/ui.ts` 用原生 DOM 渲染概览、元数据键值表与可筛选、可按体积排序的张量表，全部文本以 `textContent` 写入。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | 共享 Inspector UI Kit 原语与宿主主题变量 |

没有第三方解析器、Worker、WASM 或网络请求，使用浏览器 `DataView`/`TextDecoder`/DOM API。

## 已知限制

- 仅展示结构与元数据，不加载张量数值、不做推理。
- GGUF 支持版本 2–3，元数据与张量描述区上限 200 MiB；safetensors 头部上限 100 MiB。超出以 `resource-limit`/`invalid-file` 报错。
- GGUF 量化张量的体积是按块大小估算（用于概览），非逐元素校验。
- 张量表最多渲染前 5000 行，可按名称筛选与按体积排序。

## Agent extract

[src/extract.ts](src/extract.ts)（`./extract`）复用 `parseModel()`，经 `BinarySource.read` 只读取文件头（与浏览器同样的窗口与上限），不读张量数据。

- `inspect`：格式、版本、架构、张量数、参数量、权重体积、元数据条目数与 dtype 分布；targets 为 `metadata`、`tensors`。
- `read metadata`（默认）：头部元数据键值表；`read tensors`：名称、dtype、形状、参数量、字节数。均为 `row:` 游标分页的 Markdown 表并支持 `filter`。
- 不支持：张量数值预览、`query` / `renderImage`。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- [样例目录](examples/)：`stories260K.gguf`（GGUF v3、48 个张量的 LLM）与 `tiny-random-bert.safetensors`（100 个张量的 BERT）。

```bash
pnpm test viewer/plugins/ml-weights
```
