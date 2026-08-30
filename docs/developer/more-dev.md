# 开发者二进制格式支持方案

## 1. 背景与结论

项目需要增加“源代码以外的开发者文件”支持，重点覆盖：

- 编译产物、字节码和中间表示；
- 序列化数据和科学计算数据；
- 数据库、转储和性能诊断文件；
- 对象文件、静态库、动态库和调试符号；
- 依赖包、发布包和语言工具链产物；
- 缓存文件。

目标语言是 Python、JavaScript / TypeScript、Java、C / C++、C#、SQL、Go、Rust 和 PHP。

本方案的核心结论是：**不要按语言各做一套查看器，也不要按扩展名堆插件；应按底层结构族建设少量查看器。** 对 JAR、Wheel、NuGet 等打包格式，文件目录清单已经是足够的代表性预览，目标等级为 2，不再解析生态专属清单、依赖或入口。第一轮优先做规范公开、结构稳定、浏览器中可以安全静态解析、且能覆盖多种语言的格式。编译器私有缓存、数据库内部页和完整调试信息解析留在后续，不能为了扩展名数量虚报能力。

建议最终形成以下能力族：

1. 归档查看器：ZIP、TAR 及其派生软件包只展示文件目录和容器信息。
2. 数组与安全序列化检查器：NPY / NPZ、Pickle 等。
3. 托管运行时产物查看器：JVM class、.NET assembly。
4. 原生二进制查看器：ELF、PE / COFF、Mach-O、Unix archive。
5. WebAssembly 查看器：模块段、导入、导出、内存和自定义段。
6. 调试与性能诊断查看器：source map、V8 profile、pprof，之后再考虑 JFR / HPROF。

现有 `archive-metadata-viewer` 已支持 `.jar`、`.war`、`.ear`、`.nupkg`、`.snupkg`、`.whl` 等 ZIP 派生格式，并能列出容器目录。按本方案口径，这已经属于等级 2；但该插件当前没有 probe，协议路由仍会把它当作等级 1。相关工作只需补正确的 probe 和声明，不增加软件包专属 UI。现有 `hex-viewer` 已为任意文件提供等级 1 兜底。

## 2. 范围与支持等级口径

### 2.1 本轮目标

- 文件始终在浏览器本地处理，不上传，不执行其中的代码。
- 优先用分片读取和流式解析打开大文件。
- 对常见格式给出结构、元数据、依赖关系或代表性内容。
- 同一底层容器尽量共用读取层和 UI，不复制解析器。
- 每个格式都给出真实支持等级、限制和可验证证据。

### 2.2 明确不做

- 不运行 JAR、class、assembly、EXE、DLL、WASM、PHAR 或包内脚本。
- 不调用 Python `pickle.loads` 或任何等价反序列化机制。
- 不反编译为“接近原源码”的高级语言代码。
- 不做完整链接器、调试器、数据库恢复工具或 heap profiler。
- 不承诺解析没有稳定公开格式的编译器私有缓存。
- 不因为后缀匹配就宣称支持；魔数或结构校验失败时必须返回等级 0。
- 不自动请求 source map 或调试符号中记录的远程 URL。

### 2.3 等级判定

沿用 `viewer-plugin-protocol.md` 的全项目等级：

| 等级 | 本方案中的判定示例 |
|---:|---|
| 1 检查 | 文件头、版本、架构、段表、条目表、opcode 列表，不能恢复主要业务内容 |
| 2 代表性预览 | 打包格式的文件目录、类型和方法签名、数组摘要与抽样、模块导入导出 |
| 3 主要内容 | 数值数组分页、source map 映射、性能 profile 的 top / flame 数据可用 |

本计划暂不把任何新增格式定为等级 4 或 5。只有完成声明范围、真实样例验证和大文件路径后，才单独评审升级。

## 3. 格式清单与目标能力

优先级含义：

- P0：第一批，复用价值高、格式稳定、实现风险可控。
- P1：第二批，用户价值高，但解析面或歧义更大。
- P2：后续研究，需要重型解析、复杂大文件算法或更多真实样例。
- 暂缓：仅保留通用十六进制检查，不建设专用查看器。

### 3.1 Python

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| `.whl` | `archive-metadata-viewer`（已有） | Python 二进制 / 纯 Python 分发包 | 2 | 复用现有 ZIP 目录清单；只需补等级 2 probe，不解析 `METADATA`、依赖或兼容标签 | 已有内容能力 |
| `.egg`、`.pyz`、`.pyzw` | `archive-metadata-viewer`（已有） | 旧式包、zipapp | 2 | 加入归档 Manifest 后复用 ZIP 目录清单，不增加包入口或元数据解析 | P1 |
| `.npy` | `dev-array-viewer` | 单个 NumPy 数组 | 3（非对象 dtype） | 解析版本、dtype、shape、顺序；按页读取数值、布尔、字符串和结构化数组 | P0 |
| `.npz` | `dev-array-viewer` | 多个 NumPy 数组 | 2 / 3 | ZIP 中列数组；选中条目后复用 NPY 查看器。数值数组为 3，仅能列数组时为 2 | P0 |
| `.pkl`、`.pickle` | `dev-serialization-viewer` | Python 对象序列化 | 1 | 只解析 Pickle opcode、protocol、frame、memo 和引用到的 GLOBAL；标记危险全局，不构造对象 | P1 |
| `.joblib` | `dev-serialization-viewer` | scikit-learn / Joblib 持久化 | 1 | 先识别压缩包装和 Pickle 结构；不实例化 estimator，不承诺还原 NumPy 外置缓冲 | P2 |
| `.pyc`、`.pyo` | `dev-python-bytecode-viewer` | CPython 字节码缓存 | 1 | 读取 magic、flags、时间戳 / hash；marshal 和 code object 随版本变化，首版不做反汇编 | P1 |

NPY 对象 dtype 可能携带 Pickle 数据，必须降为等级 1，并显示“对象数组未反序列化”。NumPy 官方也建议在安全和可移植场景关闭 Pickle。格式依据：[NumPy NPY / NPZ 文档](https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html)、[Python Pickle 文档](https://docs.python.org/3/library/pickle.html)、[Wheel 规范](https://packaging.python.org/en/latest/specifications/binary-distribution-format/)。

### 3.2 JavaScript / TypeScript

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| `.tgz` | `archive-metadata-viewer`（已有） | npm registry 发布包 | 1（当前）/ 2（增强后） | 当前只能检查 gzip 外层；列出内层 TAR 目录后升到 2，不读取 `package.json` 语义 | P1 |
| `.map` | `dev-source-map-viewer` | JavaScript、CSS、WASM source map | 3 | 校验 ECMA-426，展示源文件、内嵌源码、names、映射覆盖和 generated-to-original 查询；不请求外部 sources | P0 |
| `.wasm` | `dev-wasm-viewer` | WebAssembly 模块 | 2 | 解析标准段、类型、imports / exports、memory / table、start、自定义段和函数体大小；不实例化模块 | P0 |
| `.heapsnapshot` | `dev-profile-viewer` | V8 / Chrome heap snapshot | 3 | 流式解析大 JSON，提供类型和 retained-size 摘要、对象筛选、支配关系视图；首版可先交付等级 2 摘要 | P2 |
| `.cpuprofile` | `dev-profile-viewer` | Chrome / Node CPU profile | 3 | 解析 JSON 节点与 samples，展示 top、调用树和时间线 | P1 |
| `.node` | `dev-native-binary-viewer` | Node.js 原生扩展 | 1 | 展示 ELF / PE / Mach-O 结构和导入导出 | P1 |
| `.pack` 等 bundler cache | `hex-viewer`（暂缓） | Webpack 等工具缓存 | 1 | 格式不稳定且与版本强绑定，暂不做专用解析 | 暂缓 |

Source map 是标准 JSON 文档，但“代码查看器能显示 JSON”不等于看懂映射，专用查看器应达到等级 3。规范依据：[ECMA-426 Source Map](https://tc39.es/ecma426/)、[WebAssembly 二进制格式](https://webassembly.github.io/spec/core/binary/)。

### 3.3 Java / JVM

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| `.jar`、`.war`、`.ear` | `archive-metadata-viewer`（已有） | 库、应用和企业归档 | 2 | 复用现有 ZIP 目录清单；只需补等级 2 probe，不解析 Manifest、依赖或 class 内容 | 已有内容能力 |
| `.class` | `dev-jvm-viewer` | JVM 字节码类 | 2 | 解析 constant pool、版本、类层级、字段、方法、注解、模块和 code 属性摘要；首版不反编译方法体 | P1 |
| `.jmod` | `archive-metadata-viewer`（已有，待扩展） | Java 模块文件 | 2 | 识别 JMOD 头并列出 ZIP 文件目录，不解析模块描述或 class 内容 | P1 |
| `.ser` | `dev-serialization-viewer` | Java 原生序列化 | 1 | 只做 stream token、class descriptor、字段和引用图检查，不调用 Java 对象构造逻辑 | P2 |
| `.jfr` | `dev-profile-viewer` | Java Flight Recorder | 3 | 事件类型、时间范围、线程和热点聚合；格式复杂，单独立项 | P2 |
| `.hprof` | `dev-profile-viewer` | JVM heap / CPU profile | 2 | 先做记录统计、class / instance 数量与大对象摘要；完整引用图和 dominator 后置 | P2 |

JAR 本质是 ZIP，列出归档目录即可达到本项目的等级 2；class 文件则具有独立的规范化结构，适合纯 TypeScript 有界解析。格式依据：[JAR 规范](https://docs.oracle.com/en/java/javase/17/docs/specs/jar/jar.html)、[JVM class 文件规范](https://docs.oracle.com/javase/specs/jvms/se26/html/jvms-4.html)。

### 3.4 C / C++ 与原生工具链

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| ELF：`.o`、`.so`、`.elf`、`.out` | `dev-native-binary-viewer` | Linux / Unix 对象、共享库和可执行文件 | 1 | 架构、位数、字节序、类型、program / section header、动态依赖、符号和 build-id | P1 |
| PE / COFF：`.exe`、`.dll`、`.obj`、`.lib` | `dev-native-binary-viewer` | Windows 可执行文件、库和对象 | 1 | DOS / PE / COFF 头、machine、sections、imports / exports、debug directory、签名存在性 | P1 |
| Mach-O：`.o`、`.dylib`、`.bundle` | `dev-native-binary-viewer` | macOS / iOS 对象、动态库和 bundle | 1 | thin / fat、CPU、file type、load commands、segments、dylib 依赖、符号摘要 | P1 |
| Unix archive：`.a`、部分 `.lib`、`.rlib` | `dev-native-binary-viewer` | 静态库 / 对象集合 | 1 | 列成员、符号索引、成员格式和体积；成员预览后置 | P1 |
| `.bc` | `dev-native-binary-viewer` | LLVM bitcode | 1 | 识别 wrapper / bitstream、版本和块目录；完整 LLVM IR 恢复不在首版范围 | P2 |
| `.pdb` | `dev-native-binary-viewer` | Windows / Portable PDB 调试符号 | 1 | 先区分 MSF PDB 与 Portable PDB；Portable PDB 展示 documents、方法和序列点统计 | P2 |
| `.dSYM` | `dev-native-binary-viewer`（目录暂不路由） | Apple 调试符号目录 | 1 | 当前协议以文件为打开单位，不能把目录本身注册为格式；可打开目录内 DWARF 文件后检查 | 暂缓 |
| `.pch`、`.gch`、编译器 cache | `hex-viewer`（暂缓） | 预编译头与私有缓存 | 1 | 格式强绑定编译器和版本，专用支持收益低 | 暂缓 |
| core / minidump | `dev-native-binary-viewer` | 崩溃内存转储 | 1 / 2 | ELF core 与 Windows minidump 可后续做线程、模块、异常摘要；注意超大文件与隐私 | P2 |

原生二进制的首版目标是“可靠结构检查”，不是反汇编器。ELF 一种容器同时覆盖 relocatable、executable、shared object 和 core；规范依据：[ELF 规范](https://refspecs.linuxfoundation.org/elf/elf.pdf)。

### 3.5 C# / .NET

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| `.dll`、`.exe` | `dev-dotnet-viewer` | .NET assembly / module | 2 | 在 PE 探测后识别 CLI header，展示 assembly identity、target runtime、references、types、methods、resources 和 attributes | P1 |
| `.pdb` | `dev-native-binary-viewer` | Portable / Windows 调试符号 | 1 | 与 C / C++ 共用 PDB 格式识别；Portable PDB 可展示文档、方法和序列点摘要 | P2 |
| `.nupkg`、`.snupkg` | `archive-metadata-viewer`（已有） | NuGet 包、符号包 | 2 | 复用现有 ZIP 目录清单；只需补等级 2 probe，不解析 `.nuspec`、TFM 或依赖 | 已有内容能力 |
| `.resources` | `dev-dotnet-viewer` | 编译后的 .NET 资源 | 2 | 列资源键、类型、大小；只预览安全的字符串、数字和图片，不实例化任意对象 | P2 |
| `.deps.json`、`.runtimeconfig.json` | `code-viewer`（已有） | 运行时依赖和配置 | 2 | 仍由代码查看器打开；以后可加文件名规则和依赖摘要，不需二进制插件 | P1 |

`.dll` 和 `.exe` 同时可能是原生 PE 与 .NET assembly。托管查看器的 probe 只有发现 CLI header 才返回 2，否则返回 0；原生查看器对合法 PE 返回 1。这样 .NET 文件默认进入托管查看器，原生 PE 仍进入原生查看器。格式依据：[.NET assembly 格式](https://learn.microsoft.com/en-us/dotnet/standard/assembly/file-format)、[Portable PDB 说明](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/symbols)、[NuGet 包格式](https://learn.microsoft.com/en-us/nuget/create-packages/creating-a-package)。

### 3.6 SQL 与数据库工具链

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| `.sqlite`、`.sqlite3`、明确识别为 SQLite 的 `.db` | `sqlite-viewer`（已有） | SQLite 数据库 | 5（已有） | 继续使用独立 SQLite 插件；当前 probe 已返回 5；为 `.db` 保持严格 magic probe，不能把所有 `.db` 当 SQLite | 已有 |
| `.duckdb` | `data-viewer`（已有） | DuckDB 数据库 | 1（当前路由）/ 3（补 probe 后） | data 插件已有主要内容 UI，但当前无 probe，协议路由等级仍为 1；应补轻量固定等级 probe，不与 SQLite 合并运行时 | P0 |
| `.sql` | `code-viewer`（已有） | 文本 SQL dump | 1（已有）/ 2（增强后） | 当前代码查看器无 probe，按协议为 1；以后可按语句、表和 INSERT 统计增加代表性摘要，但不执行脚本 | P2 |
| PostgreSQL custom `.dump` / `.backup` | `dev-database-artifact-viewer` | `pg_dump` 自定义格式 | 1 | 识别 header、版本、压缩和 TOC；tar 格式转储复用归档核心 | P2 |
| SQL Server `.bak`、`.mdf`、`.ldf` | `hex-viewer`（暂缓） | 备份、数据和日志 | 1 | 首版只识别签名、页大小和基础 header；不承诺恢复表数据 | 暂缓 |
| MySQL / InnoDB `.ibd`、`ibdata*` | `hex-viewer`（暂缓） | 表空间和系统表空间 | 1 | 只做 header / page 类型检查价值有限，暂不建设专用插件 | 暂缓 |

数据库内部格式往往依赖具体版本、页布局、日志和关联文件。除 SQLite / DuckDB 这种已有可在浏览器运行的引擎外，不应把“识别文件头”包装成数据库查看器。

### 3.7 Go

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| Go executable / test binary | `dev-native-binary-viewer` | 编译程序和测试二进制 | 1 | 复用 ELF / PE / Mach-O，额外识别 Go build info、版本、module 和 build ID | P1 |
| `.a` | `dev-native-binary-viewer` | Go package archive | 1 | 复用 Unix archive；识别 `__.PKGDEF` 和对象成员，只展示导出元数据存在性与成员摘要 | P1 |
| `.pprof`、`.pb.gz`、`default.pgo` | `dev-profile-viewer` | CPU、heap、mutex、PGO profile | 3 | gzip + profile.proto，提供 sample type、top、调用树 / flame 数据和标签筛选 | P1 |
| Go trace | `dev-profile-viewer` | runtime execution trace | 2 | 版本识别、时间范围、goroutine / GC / scheduler 摘要；完整交互时间线后置 | P2 |
| module `.zip` | `archive-metadata-viewer`（已有） | Go module 下载缓存 | 2 | 复用 ZIP 目录清单，不识别 `go.mod` 或模块元数据 | 已有通用 ZIP 能力 |
| build cache | `hex-viewer`（暂缓） | Go 编译缓存 | 1 | 内部格式和目录布局不适合作为稳定公共格式 | 暂缓 |

pprof 使用 gzip 压缩的 protobuf profile，格式跨 Go 以外工具复用，优先级高于 Go 私有 build cache。依据：[Go pprof / PGO 文档](https://go.dev/doc/pgo)、[pprof profile.proto 说明](https://pkg.go.dev/github.com/google/pprof#hdr-Details)。

### 3.8 Rust

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| `.rlib` | `dev-native-binary-viewer` | Rust 静态库 | 1 | 复用 Unix archive，展示对象成员、Rust metadata 成员和目标架构 | P1 |
| `.rmeta` | `hex-viewer`（暂缓） | rustc crate metadata | 1 | 内部格式不稳定，不承诺跨版本语义解析；暂不建设专用查看器 | 暂缓 |
| `.crate` | `archive-metadata-viewer`（已有，待扩展） | crates.io 发布包 | 1（当前）/ 2（增强后） | 当前尚未声明且 gzip + TAR 只支持外层；列出内层目录后升到 2 | P1 |
| native binary | `dev-native-binary-viewer` | Rust executable / cdylib | 1 | 复用 ELF / PE / Mach-O；识别 Rust 符号和 build metadata 仅作为增强 | P1 |
| `.wasm` | `dev-wasm-viewer` | Rust WebAssembly 目标 | 2 | 展示标准段与 `name`、producers 等自定义段 | P0 |
| `.ll`、`.bc` | `code-viewer`（`.ll`）/ `dev-native-binary-viewer`（`.bc`） | LLVM IR / bitcode | 2 / 1 | `.ll` 由代码查看器；`.bc` 只做结构检查 | P2 |
| incremental cache | `hex-viewer`（暂缓） | rustc 增量编译缓存 | 1 | 私有且随工具链变化，不建设专用查看器 | 暂缓 |

`.rmeta` 是 rustc 私有序列化元数据，并非稳定交换格式；应明确停在检查级，而不是追赶每个 rustc 版本。参考：[rustc `.rmeta` 内部文档](https://doc.rust-lang.org/stable/nightly-rustc/rustc_metadata/rmeta/index.html)。

### 3.9 PHP

| 格式 | 归属插件 | 常见用途 | 目标等级 | 方案 | 优先级 |
|---|---|---|---:|---|---|
| `.phar` | `archive-metadata-viewer`（已有，待扩展） | PHP 应用 / 库归档 | 2 | 为列出文件目录解析必要的 stub 边界和 manifest；不展示额外包语义，不执行 stub，不反序列化 metadata | P1 |
| Composer package `.zip` | `archive-metadata-viewer`（已有） | Composer 分发包 | 2 | 复用通用 ZIP 目录清单，不识别 `composer.json` 语义 | 已有通用 ZIP 能力 |
| PHP serialized data | `dev-serialization-viewer`（候选） | session、cache、消息数据 | 1 | 通常无统一扩展名且 session handler 格式可变；只有明确路由规则后才实现 | 暂缓 |
| OPcache file cache `.bin` | `hex-viewer`（暂缓） | PHP 字节码缓存 | 1 | 依赖 PHP 版本、构建和 ABI，不建设专用查看器 | 暂缓 |

## 4. 插件与共享层设计

### 4.1 不新增“大而全开发者查看器”

本计划中新建的插件统一使用 `dev-xxx-viewer` 命名。未来落地时，插件目录、npm workspace 包名和 Manifest id 保持同一词根，例如：

```text
viewer/plugins/dev-wasm
@anyfile/dev-wasm-viewer
manifest.id = "dev-wasm-viewer"
```

现有插件不为命名统一而重命名。JAR、Wheel、NuGet 等继续归属 `archive-metadata-viewer`，只在原插件上补 probe 或格式 adapter。建议插件边界如下：

```text
archive-metadata-viewer（已有，原地增强）
├── ZIP / TAR 文件目录
├── RAR 目录与容器信息
├── gzip 等 wrapper 信息
└── gzip + TAR 内层目录（后续补齐）

dev-array-viewer
├── NPY range parser
└── NPZ entry selector（复用安全 ZIP entry reader）

dev-source-map-viewer
└── ECMA-426 parser + mapping UI

dev-wasm-viewer
└── bounded binary parser + section UI

dev-jvm-viewer
└── JVM class parser

dev-dotnet-viewer
└── PE + CLI metadata parser

dev-python-bytecode-viewer
└── CPython pyc header / bytecode adapter

dev-native-binary-viewer
├── ELF
├── PE / COFF
├── Mach-O / fat binary
├── Unix archive
├── LLVM bitcode / PDB
└── core / minidump

dev-serialization-viewer
├── Python Pickle opcode
├── Java serialization token（后续）
└── PHP serialization token（后续且只处理明确格式）

dev-profile-viewer
├── pprof protobuf
├── Chrome CPU profile
└── heap / JFR / HPROF adapters（后续）

dev-database-artifact-viewer
└── PostgreSQL custom dump（后续）
```

JVM 与 .NET 使用独立插件，避免用户打开 `.class` 时下载 PE / CLI parser，或打开 `.dll` 时下载 JVM parser。插件边界是路由、下载和 UI 边界，不是复用边界；跨语言复用由下面的共享解析层承担。

```text
@anyfile/dev-binary-core
├── 可取消的 range reader / bounded byte source
├── checked offset、长度、加乘与资源预算
├── 大小端整数、ULEB128 / SLEB128、受限字符串
└── 通用 table / section / diagnostic 数据模型

可选的 @anyfile/archive-core（不预建）
└── 只有 archive 与 NPZ 出现第二个兼容消费者时，才从现有插件提取最小 ZIP entry reader

@anyfile/viewer-ui（已有）
└── key-value、树、表格、分页、空态、错误态和生命周期清理
```

复用关系：

- `archive-metadata-viewer` 继续独占当前归档实现；实现 NPZ 时先评估现有 ZIP adapter 是否适合读取 entry 内容，只有出现两个兼容消费者时才提取最小 `archive-core`，不因此新建查看器。
- `dev-wasm-viewer`、`dev-native-binary-viewer`、`dev-jvm-viewer`、`dev-dotnet-viewer`、`dev-python-bytecode-viewer` 和 `dev-serialization-viewer` 共用 `dev-binary-core` 的读取、边界检查和资源预算。
- `dev-profile-viewer` 的各 adapter 共用聚合结果和调用树 / 时间线 UI，但 protobuf、JSON、JFR、HPROF parser 保持独立。
- ELF、PE、Mach-O、Pickle、class、CLI metadata 等格式语法并不相同，不为了“复用率”强行抽象成通用 AST。
- 共享包只放已经出现至少两个真实消费者的稳定原语；第一个消费者先本地实现，第二个消费者出现时再提取，避免预建空抽象。

跨语言复用分为三档，不能混为一谈：

| 复用级别 | 查看器 / 格式 | 实际复用内容 |
|---|---|---|
| 完整格式 parser 复用 | `archive-metadata-viewer` 的 ZIP / TAR、`dev-native-binary-viewer` 的 ELF / PE / Mach-O、`dev-wasm-viewer` | 同一底层格式直接服务 Python、Java、C#、Go、Rust、Node 等多个生态，只实现一次 parser |
| 解析基础设施复用 | JVM class、.NET CLI、CPython pyc、Pickle、NPY | 语法各自独立，但共用安全 range read、整数 / 变长整数、offset 校验、资源预算和诊断模型 |
| 结果模型与 UI 复用 | pprof、CPU profile、JFR、HPROF、heap snapshot | 输入 parser 独立，共用调用树、时间线、聚合表、筛选和虚拟列表 |

因此，这个归类能够实现跨语言复用，但复用强度取决于文件是否真的共享底层格式。JAR 与 Wheel 可以完整复用 ZIP；Go、Rust、C++ 的 ELF 可以完整复用 ELF；class 与 .NET assembly 则只能复用基础设施，不能假装它们是同一种格式。

任何单文件不得超过 600 行，不能把格式分支堆进一个入口文件。共享 core 必须保持轻量且无 DOM，不得破坏 manifest / probe / 完整插件的延迟加载边界。

### 4.2 按查看器推进，不按语言推进

语言章节是覆盖矩阵，只用于确认 Python、Java、Go 等生态没有遗漏；它不是开发顺序。

实际推进和发布单位是一个 `dev-xxx-viewer` 的纵向切片：Manifest、probe、parser、UI、样例、协议测试和大文件验证一起完成。同一查看器内部再按底层格式逐个交付，例如 `dev-native-binary-viewer` 先 ELF，再 PE / COFF，再 Mach-O；不会先做完全部 Python 格式再转向 Java。

优先级排序依据依次是：

1. 查看器能覆盖多少种语言和真实场景；
2. 是否能复用已经落地的 core、UI 和测试夹具；
3. 格式规范是否稳定、浏览器资源是否可控；
4. 单个纵向切片能否独立验证和发布。

唯一例外是安全或协议基础工作，例如 `dev-binary-core` 的边界检查、归档解压上限和路由冲突测试；它们可以先作为当前查看器切片的一部分完成，但不独立建设成没有消费者的阶段。

### 4.3 打包格式只复用归档目录

现有归档插件继续拥有 ZIP / TAR / wrapper 的字节读取和条目索引。JAR、Wheel、NuGet、egg、zipapp、Go module ZIP 和 Composer ZIP 不增加任何生态 adapter，也不读取包清单；它们直接复用文件目录 UI，并统一视为等级 2。

需要做的工程工作仅有：

1. 在 Manifest 中补齐尚未声明的打包扩展名。
2. 增加轻量 probe：能列目录的 ZIP / TAR 及其派生包返回 2；只能显示外层压缩流信息的 wrapper 返回 1。
3. `.tgz`、`.crate` 等 gzip + TAR 格式只有实现内层 TAR 目录后才返回 2；当前只显示 gzip 外层信息时仍返回 1。
4. 保持条目数、文件名长度、central directory、解压总量和压缩比上限，防止恶意归档造成资源耗尽。

probe 可以根据扩展名与有界魔数检查返回固定等级，不需要读取包内 Manifest。`open()` 继续负责完整校验；损坏或伪装文件按 `invalid-file` 处理。

### 4.4 二进制探测与扩展名冲突

候选仍由扩展名产生，probe 只做有界读取：

```text
.dll / .exe
├── managed probe: PE + CLI header -> 2；否则 0
└── native probe: PE header -> 1；否则 0

.o
├── ELF magic -> native 1
├── Mach-O magic -> native 1
└── 其他 -> 0

.a / .rlib / 部分 .lib
└── ar magic -> archive/native 1

.db
├── SQLite magic -> sqlite 3
└── 其他 -> 专用插件 0，保留 hex 1
```

probe 不导入完整 parser，不扫描整个符号表，不初始化 WASM / Worker。解析仍在 `open()` 内重新严格校验，不能信任 probe 结果。

当前协议只按扩展名或完整文件名产生专用候选。Unix 上大量无扩展名可执行文件无法自动进入原生二进制查看器，只会进入通配的 hex viewer；本计划不通过扩大 `"*"` 候选或全局魔数扫描绕过这一 v1 边界。若真实使用数据证明无扩展名二进制是核心场景，应另行评审协议级全局探测，而不是在单个插件中做隐式例外。

### 4.5 安全边界

- 所有整数加法、乘法和 offset 计算都检查溢出与文件边界。
- 解析数量字段前设置 entries、sections、symbols、strings、nodes、edges 的硬上限。
- 字符串解码设置单字符串和累计字节上限。
- 大型 JSON（heap snapshot、CPU profile）不能直接无上限 `file.text()`。
- Pickle、Java serialization、PHP serialization 只形成 token / 引用模型，不调用构造器、reduce、autoload 或 hook。
- WebAssembly 只解析，不调用 `WebAssembly.instantiate()`；也不依赖执行模块来获取 imports / exports。
- 包内 `postinstall`、manifest class、PHAR stub、宏和二进制入口永不执行。
- source map 的 `sources`、调试符号中的路径和 package URL 只作为文本展示，不发起网络请求。
- 本地绝对路径默认只显示 basename 或经过脱敏的相对片段，避免在截图和错误中泄露用户目录。

### 4.6 大文件策略

| 数据形态 | 读取策略 |
|---|---|
| 头、尾和固定表 | `file.slice()` 随机读取 |
| ZIP central directory | 复用现有 range reader 和 ZIP adapter |
| TAR / gzip package | Worker 中流式解压，只保留条目头，不读取包清单内容 |
| NPY | 只读 header；二维内容按行 / 页计算 offset，抽样而非全量复制 |
| ELF / PE / Mach-O | 先读 header，再按已验证 offset 读取 section / symbol 子集 |
| source map | 小文件可设上限整体 JSON parse；大 mappings 字符串分段解码 |
| profile / heap | Worker 中增量 JSON / protobuf parse，UI 使用虚拟列表或聚合结果 |

## 5. 实施计划

计划按“每阶段都能独立发布”的垂直切片推进，不一次创建所有空插件。

### 阶段 0：基线、矩阵和样例门禁

当前已实现台账与 fixture 证据见 [开发者产物支持矩阵](dev-artifact-support-matrix.md)。

目标：先建立不会随开发失真的支持台账。

交付：

1. 在开发文档中维护 `format -> plugin -> level -> implemented -> verified -> fixture` 矩阵。
2. 为每个准备实现的格式收集最小、正常、损坏、截断、超限样例；能生成的样例提交生成脚本，不能再分发的样例记录人工验收来源。
3. 增加通用 binary fixture helpers：大小端整数、变长整数、range read 断言、截断生成。
4. 明确 catalog 新分类：建议新增“开发者产物”，避免把 `.dll`、`.class`、`.npy` 全塞进“代码与数据”。
5. 为每个新 manifest 补文件类型图标映射和协议合规测试。

完成门禁：矩阵只列实际实现能力；测试能证明 probe 有界读取、可取消、错误等级正确。

### 阶段 1：增强现有 `archive-metadata-viewer`

目标：不创建、不重命名插件，只校准现有归档查看器的支持等级并补复合归档能力。

交付：

1. 为现有 ZIP / TAR 及派生包增加 probe；能列文件目录时返回 2。
2. 补齐 `.egg`、`.pyz`、`.pyzw`、`.jmod`、`.crate` 等需要的 Manifest 扩展名。
3. 为 npm `.tgz`、Rust `.crate` 和其他 gzip + TAR 格式增加内层 TAR 目录读取；完成前保持等级 1。
4. 不增加 Manifest、依赖、入口、target、feature 或签名语义解析。

完成门禁：

- 每种新增后缀至少有一个真实样例和一个伪装后缀样例；
- ZIP / TAR 包能列目录并返回 2，只有 wrapper 元数据的格式返回 1；
- ZIP bomb、路径穿越名、重复条目、超大目录和异常压缩比有明确处理；
- 现有归档目录 UI 不因不同语言生态产生分支；
- 包内脚本、class、assembly 和 PHAR stub 均不执行。

### 阶段 2：`dev-array-viewer`

目标：交付 `.npy` / `.npz`。NPZ 实现时先评估复用现有 ZIP adapter；只有读取模型确实兼容时才提取最小 `archive-core`，不预先建设共享包。

交付：

1. NPY header、dtype、shape、大小端和 C / Fortran order parser。
2. 数值、布尔、字符串和结构化数组的分片分页。
3. NPZ entry selector，选中数组后进入同一 NPY 渲染路径。
4. 对象 dtype 降为等级 1，不读取其中的 Pickle 对象。

完成门禁：NPY 分页目标等级 3，NPZ 目录目标等级 2、选中普通数组后目标等级 3；大数组不整体读入内存。

### 阶段 3：`dev-wasm-viewer`

目标：交付 `.wasm` 等级 2，并在它成为第二个二进制消费者时，把已验证的读取原语提取为 `dev-binary-core`。

交付：标准段、类型、imports / exports、memory / table、start、自定义段和函数体大小；只解析，不实例化。

完成门禁：损坏 LEB128、越界 section、异常数量和截断文件被拒绝；完整 parser 和 UI 不进入首包或 probe chunk。

### 阶段 4：`dev-source-map-viewer`

目标：交付 `.map` 等级 3。

交付：ECMA-426 校验、sources / names / ignore list、映射覆盖和 generated-to-original 查询；外部 source 只显示引用，不发起请求。

完成门禁：普通与 indexed source map、损坏 VLQ、大 mappings 字符串、缺失 source 和取消路径均有测试。

### 阶段 5：`dev-native-binary-viewer`

目标：建立可跨 C / C++、C#、Go、Rust、Node native addon 使用的二进制检查基础。

按顺序交付：

1. ELF parser + UI。
2. PE / COFF parser + UI。
3. Mach-O / fat binary parser + UI。
4. Unix archive parser；识别普通 `.a`、Go `.a`、Rust `.rlib`。
5. 后续在同一插件内增加 LLVM bitcode、PDB、core / minidump adapter。

阶段验收：

- 32 / 64 位、大小端和多架构样例覆盖；
- section / symbol / string table 的数量和累计内存均有限制；
- `.dll` / `.exe` 的 managed / native 路由符合支持等级；
- stripped、无符号、损坏、截断、异常 offset 文件均有固定样例；
- UI 明确显示“结构检查，不是反编译结果”。

### 阶段 6：`dev-jvm-viewer`

目标：交付 `.class` 等级 2；JAR / JMOD 目录仍由现有 `archive-metadata-viewer` 负责。

交付：constant pool、版本、类层级、字段、方法、注解、模块和 code 属性摘要，不反编译方法体。

完成门禁：覆盖不同 class major version、wide constant pool entry、未知 attribute、损坏索引和截断文件；复用 `dev-binary-core`，不依赖 native viewer 实现。

### 阶段 7：`dev-dotnet-viewer`

目标：交付 .NET `.dll` / `.exe` 等级 2，与原生 PE 查看器正确竞争。

交付：CLI header、assembly identity、target runtime、references、types、methods、resources 和 attributes；以后在同一插件增加 `.resources`。

完成门禁：managed probe 对 CLI PE 返回 2、对 native PE 返回 0；native viewer 对合法 PE 返回 1；两个插件共用 `dev-binary-core` 的 PE 定位原语或只读结构，不共享可变状态。

### 阶段 8：`dev-serialization-viewer`

目标：满足 `.pkl` 等“无法直接打开但经常需要判断内容”的场景，同时保持零执行。

先实现 Python Pickle opcode inspector，完成安全评审后再决定是否加入 Java `.ser` 和 PHAR / PHP serialization token adapter。

阶段验收：

- 覆盖 Pickle protocol 0–5、frame、memo、persistent id、out-of-band buffer 声明；
- GLOBAL / STACK_GLOBAL / REDUCE / BUILD 等潜在执行语义醒目标记；
- 测试中即使 payload 含恶意 reduce，也没有函数调用、动态 import 或网络请求；
- 循环引用只生成有限图，不递归爆栈；
- 截断、超深栈、超大 memo、超长字符串触发明确限制。

### 阶段 9：`dev-profile-viewer`

目标：先做能达到等级 3 的 profile，再评估超大 heap 格式。

建议顺序：

1. pprof / `default.pgo`；
2. Chrome / Node `.cpuprofile`；
3. Go trace；
4. V8 `.heapsnapshot`；
5. JFR；
6. HPROF。

这些格式需要虚拟列表、聚合、图算法和更严格的内存预算。每个格式先用真实大文件测量解析峰值、首屏时间和取消延迟，再决定是否使用 Worker / WASM。crash dump 保持在 `dev-native-binary-viewer`，不放进 profile viewer。

### 阶段 10：按证据决定的后续查看器或 adapter

只有满足“真实用户文件足够常见 + 有稳定规范或成熟解析器 + 浏览器资源可控”时，才考虑：

- Portable PDB、LLVM bitcode 深层结构；
- PostgreSQL custom dump；
- JFR / HPROF 完整视图；
- minidump / ELF core；
- `.resources`；
- `.pyc` marshal / bytecode 反汇编。

SQL Server MDF / LDF / BAK、InnoDB 表空间、PCH、rustc / Go / bundler 私有缓存默认继续由 hex viewer 检查。若以后引入源码构建的 WASM 解析器，必须先按 `viewer-source-built-dependencies.md` 单独评审构建、许可、升级和产物审计方案。

## 6. 每个格式的统一完成定义

一个格式只有满足以下条件才可在 catalog 和 Manifest 中宣称支持：

1. **识别**：扩展名进入候选；probe 能用有界读取确认格式和真实等级。
2. **解析**：`open()` 再次严格校验，不信任扩展名或 probe。
3. **能力**：UI 展示与声明等级匹配的内容，不以控件数量抬高等级。
4. **大文件**：存在明确的读取、条目、字符串、节点和内存上限。
5. **安全**：不执行、不反序列化、不自动联网、不把不可信内容注入 HTML。
6. **生命周期**：opening / active 阶段可取消，失败清理完整，`dispose()` 幂等。
7. **样例**：至少有正常、损坏、截断和超限证据；优先包含真实工具链生成样例。
8. **路由**：与 hex、archive、code、SQLite 及其他同扩展名插件的排序经过测试。
9. **展示**：桌面窄 / 矮窗口可用，长表使用单一滚动容器和必要虚拟化。
10. **工程门禁**：`pnpm test`、`pnpm lint`、`pnpm build` 通过，`/view` 初始包不包含新解析器。

## 7. 第一批建议排期结论

如果只批准一个连续开发批次，建议范围固定为：

1. 增强现有 `archive-metadata-viewer`：给 `.whl`、`.jar`、`.war`、`.ear`、`.nupkg`、`.snupkg` 补等级 2 probe，不创建新插件。
2. `dev-array-viewer`：`.npy` / `.npz`，等级 3 / 2；实现 NPZ 时再按真实接口决定是否提取最小 ZIP 共享层。
3. `dev-wasm-viewer`：`.wasm`，等级 2，并在第二个消费者出现时提取 `dev-binary-core`。
4. `dev-source-map-viewer`：`.map`，等级 3。

npm `.tgz`、Rust `.crate` 的内层 TAR 目录属于独立的归档增强，可以放在随后的小批次；不为任何打包格式建设清单或依赖视图。第一批因此主要验证分片读取、资源限制和路由机制。原生 ELF / PE / Mach-O 放在紧随其后的独立批次，避免首批同时承担数组、映射和三套可执行文件格式的复杂度。
