# Apple 属性列表查看器 (`apple-plist`)

## 基本介绍

- **插件 ID**：`apple-plist`
- **格式入口**：`.plist`

以可展开树查看 Apple 属性列表，支持二进制 `bplist00` 与 XML 文档两种格式，覆盖应用配置、偏好设置、Info.plist 等常见来源，全程在浏览器本地解码，不上传文件。

## 实现原理

1. `src/probe.ts`（`probePlistFile`）复用 `parse.ts` 的 `looksLikePlist`：只读文件头（≤64 KiB）即可区分二进制魔数 `bplist00`、XML 声明/DOCTYPE 与普通文本，二进制返回等级 3、XML 返回等级 2，不加载解码器。
2. `src/binary-plist.ts` 自研二进制解码器：读取末尾 32 字节 trailer 得到 offset size、object ref size、对象数与顶层对象，遍历对象表解码 dict/array/integer/real/date/data/ASCII 与 UTF-16 字符串/UID；对偏移、引用与长度做边界校验。
3. `src/xml-plist.ts` 自研 XML 分词器：不依赖 DOMParser，处理 XML 声明、DOCTYPE、注释、实体与嵌套 dict/array/key/标量标签，Node 与浏览器行为一致。
4. `src/ui.ts` 用原生 DOM 把值渲染为可展开/收起的树，侧栏给出字典、数组、标量计数与根类型，并支持即时筛选键与值、全部展开与收起。所有文本以 `textContent` 写入。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | 共享 Inspector UI Kit 原语与宿主主题变量 |

没有第三方解析器、Worker、WASM 或网络请求。

## 已知限制

- 只读：不编辑、不写回任何值。
- 只解码标准 plist 值类型；未知标记以 `invalid-file` 拒绝。
- 嵌套深度上限 2048 层，对象数上限 50 万，单文件上限 64 MiB；超出以 `resource-limit` 报错。
- 二进制 `data` 仅显示字节大小与十六进制预览，不完整转储。

## 开发与验证

- [格式声明](src/manifest.ts)、[打开入口](src/index.ts)、[探测](src/probe.ts)（`probePlistFile`）。
- [样例目录](examples/)：`app-config.binary.plist`（由 XML 样例经 `plutil` 转换）与 `app-config.xml.plist` 描述同一份配置，用于验证两种格式解码结果一致。

```bash
pnpm test viewer/plugins/plist
```
