# 开发者产物查看架构及支持矩阵

本文件记录非源代码开发者二进制与诊断产物的分族原则、安全边界、当前支持矩阵及未实现候选。各插件实现与测试命令见对应 `viewer/plugins/*/README.md`。

## 1. 分族与安全原则

- **按底层二进制结构分族，不按语言堆插件**：JAR/WAR/EAR/Wheel/NuGet/egg/pyz/jmod/tgz/crate 等打包格式统一留在 `archive-metadata-viewer`（等级 2，仅列容器目录，不解析生态专属清单语义）。
- **零执行、零反序列化、零联网**：绝不执行 JAR/class/assembly/EXE/DLL/PHAR stub；绝不实例化 WASM；绝不调用 Pickle 反序列化（`objects.npy` 保持等级 1）；绝不请求 source map 中的远程 URL；截断或脱敏敏感本地路径；所有偏移/计数/字符串分配前校验整数溢出与边界。
- **共享基础层**：`@anyfile/dev-binary-core` 提供无 DOM 的可取消 range read、边界校验、端序读写与 ULEB/SLEB128 游标；仅在存在第二个稳定调用方时提取共享层。
- **同扩展名探测规则**：`.obj`（COFF 原生二进制 vs Wavefront 3D 网格）、`.node`/`.o`（ELF/PE/Mach-O 魔数区分）、`.db`（SQLite 魔数 vs Hex 兜底）；v1 协议不对无扩展名 Unix 二进制做 `"*"` 全局嗅探。

## 2. 当前支持矩阵

| 格式 | 插件 | 等级 | 状态 | 能力与边界 |
|---|---|---:|---|---|
| ZIP 及派生包（`.zip` `.jar` `.war` `.ear` `.whl` `.nupkg` `.snupkg` `.egg` `.pyz` `.pyzw`） | `archive-metadata-viewer` | 2 | verified | 有界中央目录清单；不执行包内脚本；路径穿越仅作文本标记 |
| TAR / `.tar.gz` / `.tgz` / `.crate` / JMOD / RAR 4–5 | `archive-metadata-viewer` | 2 | verified | gzip+TAR 顺序解压至目录末尾（受输出与压缩比上限约束）；RAR 覆盖 SFX/加密头/CRC 校验 |
| 单流压缩（`.gz` `.xz` `.zst` `.bz2` `.lz4` `.zlib` `.deflate` `.br`） | `archive-metadata-viewer` | 1 | verified | 容器/流头检查，裸流仅展示可诚实取得的字段 |
| NumPy NPY（非 object）/ NPZ | `dev-array-viewer` | 2–3 | verified | 分页数值/布尔/字符串/Unicode/复数/结构化数组；NPZ stored 走 range read、DEFLATE 流式解至选中页；object dtype 降级为等级 1 且不读 Pickle |
| WebAssembly (`.wasm`) | `dev-wasm-viewer` | 2 | verified | 标准段、type/import/function/memory/export/start/custom 与 code 体大小统计；不实例化 |
| Source Map (`.map`) | `dev-source-map-viewer` | 3 | verified | ECMA-426 普通与 indexed map、内嵌源码、ignore list 与位置查询；禁止加载外部 URL |
| ELF / PE-COFF / Mach-O & Fat / Unix Archive (`.elf` `.so` `.o` `.out` `.exe` `.dll` `.obj` `.dylib` `.bundle` `.node` `.a` `.lib` `.rlib`) | `dev-native-binary-viewer` | 1 | verified | 头部、节/段表、动态依赖、导入导出、Universal Fat 切片、UUID/Build-ID/CodeView PDB、符号摘要与 `.a`/`.rlib` 成员嗅探 |
| DuckDB (`.duckdb` `.ddb`) | `duckdb-data` | 3 | verified | 只读表结构与分页查询，有界 probe |

## 3. 未实现候选族

- **托管运行时产物**：JVM `.class`（`dev-jvm-viewer`）、.NET CLI `.dll`/`.exe`（`dev-dotnet-viewer`，与原生 PE 共存探测）。
- **安全序列化检查**：Python Pickle `.pkl`/`.pickle`、Java 序列化 `.ser`（只解析 opcode/token 与危险引用，绝不构造对象）。
- **性能与内存诊断**：Chrome/Node `.cpuprofile` / `.heapsnapshot`、Go `.pprof`、JVM `.jfr` / `.hprof`。
- **其他工具链产物**：CPython `.pyc`、PHP `.phar`、PostgreSQL custom dump、LLVM `.bc`、MSF/Portable `.pdb`。
