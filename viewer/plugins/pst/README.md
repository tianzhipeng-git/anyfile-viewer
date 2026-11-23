# Outlook 邮箱归档查看器 (`outlook-pst`)

## 基本介绍

- **插件 ID**：`outlook-pst`
- **格式入口**：`.pst`（个人文件夹）、`.ost`（脱机文件夹缓存）

按需随机读取 Outlook 邮箱归档：文件夹树、分页邮件列表、邮件正文/收件人/邮件头与附件。支持 ANSI（Outlook 97–2002）、Unicode（2003+）与 Outlook 2013+ 的 4K 页 zlib 压缩 OST；打开时只读取几 KB 索引页，GB 级文件不整体载入内存。

## 实现原理

按 [MS-PST] 的三层结构自研，全部为纯 TypeScript，经 `Blob.slice` 随机读取：

1. `src/header.ts`：文件头（`!BDN` 魔数、`SM`/`SO` 客户端魔数、版本 14/15/23/36、加密方式、NBT/BBT 根）。probe 只依赖此文件，读取前 564 字节。
2. `src/ndb.ts`（NDB 层）：NBT/BBT B-tree 页查找（512 B 与 4K 页两种布局，页/块 LRU 缓存）、数据块读取（permute 解码、4K 格式 `cb≠cbInflated` 时用 `DecompressionStream("deflate")` 解压）、XBLOCK/XXBLOCK 展开、SLBLOCK/SIBLOCK 子节点树。
3. `src/ltp.ts`（LTP 层）：Heap-on-Node（按页懒加载）、BTH、属性上下文 PC、表上下文 TC。TC 行按块按需读取，只解码请求的列；OST 内容表中指向表结构或与其他列共享的未缓存字符串单元视为缺失。
4. `src/messaging.ts`（消息层）：消息存储、层级表（nid 类型 0x0D）、内容表（0x0E）分页、邮件 PC、收件人表（0x692）、附件表（0x671）与附件数据；打开时有界广度优先选择默认文件夹（优先有邮件的 Inbox）。
5. `src/rtf.ts`：PidTagRtfCompressed 的 LZFu 解压，RTF 转纯文本或还原 `\fromhtml1` 封装的 HTML。
6. `src/html.ts` + `src/message-view.ts`：HTML 正文经白名单清理（去脚本/表单/嵌入/事件属性/链接 href/远程图片与 CSS `url()`），注入 CSP 后放入 `sandbox="allow-same-origin"`（无脚本）iframe；`cid:` 内嵌图片从附件转为 blob URL，拦截的远程引用数量提示给用户。附件按需读取并以 blob URL 保存。
7. `src/ui.ts`：Inspector 分栏外壳，侧栏懒加载文件夹树，主区 50 条一页的邮件表与阅读区。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | Inspector UI Kit（外壳、表格、分页、标签页） |

无第三方解析器、Worker、WASM 或网络请求；需要浏览器 `DecompressionStream` 与 `DOMParser`。

## 已知限制

- 只读；不支持全文搜索与按列排序（列表按内容表存储顺序分页）。
- 日历、联系人、任务等项目只显示通用邮件字段；内嵌邮件附件（attach method 5）只列出不展开；不解析命名属性映射。
- 不支持高强度（cyclic）加密归档（probe 返回 0）；PST 密码仅由 Outlook 校验，不影响读取。
- 上限：单节点数据 64 MiB、单附件 512 MiB、内嵌图片合计 32 MiB、子节点 10 万、单文件夹子文件夹 1 万；超出以 `resource-limit` 报错或跳过。
- 未有可再分发的 ANSI 样例，ANSI 路径按规范实现、未经真实文件验证。

## 开发与验证

- [格式声明](src/manifest.ts)、[打开入口](src/index.ts)、[探测](src/probe.ts)（`probePst`）。
- [样例目录](examples/)：`dist-list.pst`（Unicode PST，含日历/联系人/通讯组）。
- 大文件/私有样例：`PST_TEST_FILE=/abs/mailbox.pst pnpm test viewer/plugins/pst`（同样适用于 `.ost`）。

```bash
pnpm test viewer/plugins/pst
```
