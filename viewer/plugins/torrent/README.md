# BitTorrent 种子查看器 (`bittorrent-metadata`)

## 基本介绍

- **插件 ID**：`bittorrent-metadata`
- **格式入口**：`.torrent`

查看 BitTorrent 种子（metainfo，支持 v1 与 BEP 52 v2）的共享文件清单与大小、Tracker 与 Web 种子、分块大小、创建信息，以及由 `info` 字典原始字节计算的 InfoHash（v1 为 SHA-1，v2-only 为 SHA-256）。不连接任何节点，也不下载内容。

## 实现原理

1. 以可取消的文件流读取整个种子文件（上限 32 MiB）。
2. 自研 Bencode 解码器（`src/bencode.ts`）解析整数、字节串、列表与字典，限制嵌套深度，记录顶层 `info` 字典的原始字节区间。
3. `src/parse.ts` 将解码结果映射为展示模型：v1 文件列表或 v2 `file tree`、多级 `announce-list` 与 `url-list`、分块数等，并用 WebCrypto 对 `info` 原始字节计算 SHA-1（v1）/ SHA-256（v2-only）得到 InfoHash。
4. `src/ui.ts` 用原生 DOM 渲染元数据区与可筛选、可按大小排序的文件表，全部文本以 `textContent` 写入。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | 共享 Inspector UI Kit 原语与宿主主题变量 |

没有第三方解析器、Worker、WASM 或网络请求，使用自研 Bencode 解码器与浏览器 DOM/WebCrypto API。

## 已知限制

- 仅展示元数据，不下载内容、不连接 Tracker 或节点。
- 文件上限 32 MiB，嵌套深度上限 512 层；超出以 `resource-limit`/`invalid-file` 报错。
- 文件表最多渲染前 5000 行，可按路径筛选与按大小排序。
- 插件没有内容 probe，仅凭 `.torrent` 扩展名进入候选；无效文件在打开阶段报错。

## 开发与验证

- [格式声明](src/manifest.ts)、[打开入口](src/index.ts)；此插件没有独立内容探测，候选等级默认为 1。
- [样例目录](examples/)：`sintel.torrent`（Blender 开放电影 Sintel 官方种子，含 11 个文件、多级 tracker 与 Web 种子）。

```bash
pnpm test viewer/plugins/torrent
```
