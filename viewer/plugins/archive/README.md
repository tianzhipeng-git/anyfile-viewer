# 压缩与归档元数据查看器 (`archive-metadata-viewer`)

读取压缩/归档文件的**容器级元数据**（目录、头部字段、包装流信息），不解压展示内部文件内容。

## 基本介绍

- **插件 ID**：`archive-metadata-viewer`
- ZIP、ZIP 派生包、JMOD、RAR 和 TAR 返回等级 2；只展示压缩包装信息的格式返回等级 1。
- `.tgz`、`.tar.gz` 与 `.crate` 使用浏览器流式 gzip 解压，只保留 TAR 条目头，不读取包清单或执行包内内容。
- `.egg`、`.pyz`、`.pyzw`、JAR、Wheel 与 NuGet 只复用通用目录 UI，不增加生态专属语义。
- **支持格式**：
  - ZIP 及派生（`.zip`、`.jar`、`.docx`、`.apk` 等）
  - RAR 4.x / 5.x（`.rar`，含有界 SFX 签名扫描）
  - TAR（`.tar`）
  - 独立压缩流：gzip、XZ、Zstandard、bzip2、LZ4、zlib、raw DEFLATE、Brotli
  - 复合名如 `.tar.gz`、`.tar.xz`、`.tar.zst`
- **能力**：列出 ZIP/TAR 条目；解析各压缩格式的头部/尾部字段；标注检测方式（扩展名 vs 魔数）
- **示例文件**：`examples/`（运行 `scripts/generate-examples.mjs` 可重新生成）

## 实现原理

1. **格式识别**（`src/format-registry.ts`）
   - 优先按扩展名匹配，再用文件头魔数交叉验证
   - 扩展名与魔数不一致时，以魔数为准并标注

2. **按需读取**（`src/range-reader.ts`）
   - 对 `File` 做 range 读取，避免整文件加载
   - 支持 `AbortSignal` 取消

3. **分格式解析**
   - **ZIP**（`src/zip-adapter.ts`）：`@zip.js/zip.js` 读取中央目录与条目元数据
   - **RAR**（`src/parsers/rar.ts`）：顺序读取 RAR4/RAR5 头部，按记录长度跳过压缩数据
   - **TAR**（`src/parsers/tar.ts`）：自研解析 POSIX/PAX 头、符号链接等
   - **gzip TAR**（[src/parsers/gzip-tar.ts](src/parsers/gzip-tar.ts)）：流式解压并扫描内部 TAR 头部
   - **包装流**（`src/parsers/wrappers.ts`）：自研解析 gzip/XZ/zstd/bzip2 等头部与尾部字段

4. **UI**（`src/ui/`）
   - 结构化展示格式名、检测依据、字段表、条目列表（ZIP/RAR/TAR）及限制说明

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@zip.js/zip.js@2.8.60` | ZIP 目录读取与所需条目解压 |

TAR 与各压缩包装格式的解析为项目内自研；gzip TAR 扫描使用浏览器 `DecompressionStream`。此外，本包向电子书插件导出受限的归档读取工具，这些工具的解压用途与本插件元数据界面分开。

## 已知限制

- **不展示条目内容**：归档查看界面只展示元数据，不提供提取或内部文件预览；gzip TAR 为扫描目录会流式解压，解压出的文件数据不保留。
- **复合归档**：`.tar.gz`、`.tgz`、`.crate` 可扫描内部 TAR 目录；解压后最多 512 MiB，并设 1000:1 比例护栏（小文件容许至少 1 MiB）。其他压缩 TAR 目前只展示外层包装信息；gzip TAR 非资源超限的扫描失败可回到包装元数据。
- **raw DEFLATE / Brotli**：无独立容器目录，只能展示流级元数据
- **加密 ZIP**：普通条目加密仍可列出未加密中央目录中的元数据；中央目录加密时仅显示限制说明，不请求密码，也不解密内容。
- **RAR**：不解压条目；文件头加密时无法列出目录；分卷归档只展示当前所选卷
- **超大归档**：ZIP 中央目录或 TAR 头扫描可能较慢，但设计上避免全量读入
- 部分扩展名（如 `.docx`）在此插件中仅作为 ZIP 容器识别，实际文档预览由对应 Office 插件负责

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/archive-metadata-viewer test
```
