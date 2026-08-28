# 压缩与归档元数据查看器 (`archive-metadata-viewer`)

读取压缩/归档文件的**容器级元数据**（目录、头部字段、包装流信息），不解压展示内部文件内容。

## 基本介绍

- **插件 ID**：`archive-metadata-viewer`
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
   - **包装流**（`src/parsers/wrappers.ts`）：自研解析 gzip/XZ/zstd/bzip2 等头部与尾部字段

4. **UI**（`src/ui/`）
   - 结构化展示格式名、检测依据、字段表、条目列表（ZIP/TAR）及限制说明

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议 |
| `@zip.js/zip.js@2.8.60` | ZIP 中央目录与条目读取 |

TAR 与各压缩包装格式的解析为项目内自研，无额外运行时依赖。

## 已知限制

- **不解压**：除元数据外不展示文件内容；用户不能从这里提取或预览内部文件
- **复合归档**（如 `.tar.gz`）：只解析外层压缩包装，不扫描内部 TAR 目录（需解码数据流）
- **raw DEFLATE / Brotli**：无独立容器目录，只能展示流级元数据
- **加密 ZIP**：不支持读取加密条目内容或元数据
- **RAR**：不解压条目；文件头加密时无法列出目录；分卷归档只展示当前所选卷
- **超大归档**：ZIP 中央目录或 TAR 头扫描可能较慢，但设计上避免全量读入
- 部分扩展名（如 `.docx`）在此插件中仅作为 ZIP 容器识别，实际文档预览由对应 Office 插件负责
