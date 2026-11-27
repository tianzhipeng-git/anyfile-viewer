# HTTP Archive 查看器 (`http-archive`)

## 基本介绍

- **插件 ID**：`http-archive`
- **格式入口**：`.har`

支持 `.har` 网络抓包文件，展示请求总数、页面数、总耗时和传输量，并提供请求筛选、分页及请求/响应详情。

## 实现原理

插件通过可取消的文件流读取 UTF-8 文本，使用 `JSON.parse()` 解析并校验 `log.entries` 的核心字段。界面用原生 DOM 构建：每页显示 100 条请求，可按方法、状态、URL 或 MIME 类型筛选；详情包含头部、查询参数、正文和 timing。文件内容始终以 `textContent` 展示，不执行其中的脚本。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | 共享 Inspector UI Kit 原语与宿主主题变量 |

没有第三方解析器、Worker、WASM 或网络请求，使用浏览器 JSON 与 DOM API。

## Agent extract

[src/extract.ts](src/extract.ts) 在 Node worker 内复用 `parse.ts` 的 `readHar()`：

- `inspect`：HAR 版本、生成工具、页面数、请求数、主机分布（前 20）、方法与状态分类计数、首个请求开始/最后完成时间与跨度、响应总字节；最多列出 50 个 `entry:<n>` 目标。
- `read` 目标：`entries`（序号、开始时间、方法、状态、URL、MIME、大小、耗时的 Markdown 表格，`row:` 游标）；`entry:<n>`（timing、请求/响应头、查询参数、表单参数与正文，正文最多 16 KiB；Base64 正文仅在解码为 UTF-8 文本时展示，二进制只报告长度），`line:` 游标。两类目标都支持 `filter`。不支持 `render`。

## 已知限制

- 文件最大 128 MiB；读取后会拼接完整文本并整体解析，超大 HAR 不支持流式 JSON 解析或虚拟列表。
- 仅校验查看所需的核心结构，不执行完整 HAR 规范校验，也不提供瀑布图、页面级分组或导出能力。
- 请求和响应正文只预览前 32 KiB；Base64 正文显示原始编码文本，不解码二进制内容。
- 插件没有内容 probe，仅凭 `.har` 扩展名进入候选；无效文件在打开阶段报告错误。

## 开发与验证

- [格式声明](src/manifest.ts)、[打开入口](src/index.ts)；此插件没有独立内容探测，候选等级默认为 1。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/har
```
