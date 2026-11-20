# 原生二进制结构查看器 (`dev-native-binary-viewer`)

在浏览器本地只读检查 ELF、PE/COFF、Mach-O（含 Universal Fat）与 Unix archive 的静态结构，绝不反编译或执行所选二进制文件。

## 基本介绍

- **插件 ID**：`dev-native-binary-viewer`
- **支持格式**：
  - ELF：`.elf`、`.so`、`.o`、`.out`、`.node`
  - PE / COFF：`.exe`、`.dll`、`.obj`、`.node`
  - Mach-O：`.dylib`、`.bundle`、`.o`、`.node`
  - Unix archive：`.a`、`.lib`、`.rlib`
- **能力**：文件头与架构识别、Program Headers / Load Commands / Data Directories、节表（Sections）、动态依赖与导入导出、符号摘要（有界显示）、Build-ID / UUID / CodeView PDB / 签名存在性检查、Universal Fat 多架构切片切换与表格筛选。
- **数据处理**：通过 `@anyfile/dev-binary-core` 使用 `file.slice()` 按范围读取，文件始终保留在本地。

## 实现原理

1. [src/probe.ts](src/probe.ts) 仅读取有界文件头与少量偏移范围，识别 ELF、PE/COFF、Mach-O/Fat 与 `!<arch>\n` 并返回等级 `1`（对 Wavefront `.obj` 与 Java `.class` 返回 `0`）。
2. [src/parser.ts](src/parser.ts) 按魔数分发至 [src/elf.ts](src/elf.ts)、[src/pe-coff.ts](src/pe-coff.ts)、[src/mach-o.ts](src/mach-o.ts) 与 [src/unix-ar.ts](src/unix-ar.ts)，在 [src/limits.ts](src/limits.ts) 约束下做溢出与越界校验。
3. [src/ui.ts](src/ui.ts) 使用 `textContent` 构建只读检查界面，明示“仅结构检查，非反编译或反汇编”。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/dev-binary-core` | 可取消的 `FileByteSource` 与有界范围读取 |
| `@anyfile/viewer-protocol` | 插件协议、错误码与本地化辅助 |

## 已知限制

- 最大文件 512 MiB，节数量上限 2048，Load Commands 上限 4096，Unix archive 成员上限 4096，单次字符串表读取上限 8 MiB，符号表解析显示上限 4096 条。
- 只做结构检查，不反汇编机器码、不反编译源码、不解析完整 DWARF / PDB 调试行号，也不替代 `.NET` 托管元数据查看器。
- 无扩展名的原生可执行文件当前按协议进入通配十六进制查看器。

## 开发与验证

```bash
pnpm test viewer/plugins/dev-native-binary
```
