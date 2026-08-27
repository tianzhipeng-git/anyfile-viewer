# 压缩/归档元数据查看器计划

## 总结

新增一个用户可见插件 `archive-metadata-viewer`，用于展示压缩文件和归档文件中无需解码条目数据即可取得的元数据。

```text
File / Blob
    ↓
格式识别
    ├── 可直接读取的头部、尾部、索引或目录流
    ├── 允许解码独立的压缩目录头
    └── 禁止读取或解码普通文件条目 payload
    ↓
摘要 + 元数据字段 + 可用时的条目列表
```

- 不提供解压、导出、嵌套打开、密码输入或分卷拼接。
- 不引入 libarchive、7-Zip WASM 或通用解压引擎。
- 不修改 viewer protocol。
- 注册顺序保持“现有专用查看器 → 归档/压缩元数据查看器 → 通用查看器”，因此 DOCX、APK 等 ZIP 派生格式仍优先使用现有专用查看器。

## 能力边界

### 允许

- 读取格式识别所需的 magic 和固定头部。
- 读取格式定义的尾部、索引、中央目录或其他独立元数据区域。
- 解码格式明确指定的独立压缩目录头或元数据流，但必须限制输入范围和解码后的最大尺寸。
- 对未压缩 TAR，读取每个 512 字节头，并根据头部记录的大小直接跳到下一个头部。
- 读取 PAX 扩展头、GNU longname/longlink 等格式明确标记的元数据记录；这些记录按元数据上限读取，不视为普通文件条目 payload。
- 展示从上述区域直接取得的路径、类型、大小、时间、方法、校验值、权限、链接目标、注释和加密标志。

### 禁止

- 读取或解码任何普通文件条目的 payload。
- 为了寻找后续条目头而顺序解码夹杂文件体的压缩流。
- 通过解码文件内容计算缺失的大小、校验值、MIME、预览或完整性结果。
- 把“没有读取条目内容”和“没有解码任何字节”混为一谈；独立的压缩目录头可以解码，文件体不可以。

判断规则如下：

> 只有当元数据区域能由格式结构独立定位，且读取、解码过程不经过任何普通文件条目 payload 时，才允许解析。

因此：

- ZIP/ZIP64 可以读取中央目录并展示条目。
- 未压缩 TAR 可以读取条目头并 seek 跳过文件体。
- 7z 等格式如果目录头是可独立定位的压缩元数据流，未来可以用专用解析器解码该目录头。
- `.tar.gz`、`.tar.xz`、`.tar.zst` 等只展示外层压缩包装信息，不扫描内部 TAR，也不展示内部条目。
- solid archive 如果列目录需要解码条目数据流，则不支持列目录。
- 加密目录头、需要密码才能读取的目录和分卷目录只显示限制原因。

## 第一阶段格式范围

### 可展示条目列表

- ZIP、ZIP64：读取 EOCD、ZIP64 EOCD 和中央目录，不读取 local entry payload。
- ZIP 派生格式：JAR/WAR/EAR、APK/AAB/IPA、EPUB、ODF/OOXML、NuGet/VSIX、Wheel、XPI、CBZ、KMZ、USDZ；仅作为 ZIP 元数据解析，现有专用查看器仍优先。
- TAR：支持 ustar，以及有明确类型标记的 PAX 扩展头和 GNU longname/longlink 元数据记录；按记录大小跳过普通文件体。

### 只展示包装层元数据

- gzip：头部标志、原始文件名、注释、mtime、尾部 CRC32 和模 2^32 的原始大小。
- xz：stream header/footer、flags 和 index 中可直接取得的信息。
- zstd frame：frame header、可选 content size、dictionary ID 和 checksum 标志。
- bzip2：签名和块大小参数。
- LZ4 frame：frame descriptor、可选 content size、dictionary ID 和 checksum 标志。
- zlib：CMF/FLG、dictionary 标志和尾部 Adler-32。
- raw DEFLATE、Brotli 等没有标准容器元数据的裸流：只展示后缀推断、文件大小和“没有可读取的容器元数据”，不做全量解码验证。

复合压缩 TAR 后缀仍可注册，但只进入外层压缩格式解析器。UI 必须明确显示“未扫描内部归档，因为取得其目录需要解码文件体”。

### 暂不支持

- 7z、RAR、CAB、LHA/LZH、XAR、cpio、ar、ISO9660 等格式的条目目录。
- WIM/ESD、CHM、MSI、NSIS、ASAR、Apple Archive 等应用容器。
- SquashFS、APFS、EXT、NTFS、DMG、QCOW2、VHD/VMDK 等文件系统和磁盘镜像。
- 加密目录、分卷归档和依赖外部文件的目录。

这些格式不作为当前计划的阶段承诺。以后只有在存在明确需求时，才为某一格式增加独立的小型解析器；不得为了格式数量重新引入通用归档引擎。

## 实现设计

### 插件结构

插件内部保留最少的职责拆分：

```text
archive-metadata-viewer/
├── manifest.ts              纯数据格式声明
├── index.ts                 open()、生命周期和 UI 装配
├── range-reader.ts          受限分片读取和读取审计
├── format-registry.ts       扩展名、复合后缀和 magic
├── zip-adapter.ts           zip.js 元数据读取适配
├── parsers/                 TAR 和压缩包装的小型解析器
└── ui/                      摘要、字段和条目表
```

- 解析器只通过 `RangeReader` 读取 `File`，禁止直接调用整文件 `arrayBuffer()`。
- 每次读取必须带 `header`、`trailer`、`index` 或 `directory` 用途；测试同时根据 fixture 的真实 payload 区间验证读取范围，而不是只信任用途标签。
- 需要解码压缩目录头时，解析器只能把已定位的元数据范围交给对应的小型 codec，并设置解码输出上限。
- 第一阶段不默认引入 Worker。解析和分页在真实大文件测试中造成明显主线程阻塞时，再针对具体解析器增加 Worker，不预先建设通用 Worker 协议。
- 插件实现通过注册项动态加载；manifest 不访问 DOM、Worker、WASM 或浏览器全局，不影响 SSG/SSR 和 `/view` 首包。

### 技术选型

第一阶段采用“ZIP 使用窄入口外部库，其余元数据解析器自行实现”的混合方案。这里的自行实现仅指格式结构解析，不自行实现 DEFLATE、LZMA、Zstandard 等压缩算法。

#### ZIP/ZIP64

- 使用精确版本 `@zip.js/zip.js@2.8.60`，依赖写在插件自己的 `package.json` 中并提交 lockfile。
- 从 `@zip.js/zip.js/lib/zip-core-custom.js` 只导入 `ZipReader` 和 `Reader`。该入口不内嵌 deflate 实现，并将 Worker URI 和 WASM URI 保持为空。
- 实现 `Reader` 子类，把 `readUint8Array(offset, length)` 委托给项目的 `RangeReader`；不直接使用 zip.js 的 `BlobReader`，确保所有读取都经过统一审计和资源上限。
- 只调用 `getEntries()` 或 `getEntriesGenerator()` 取得中央目录元数据，禁止调用、包装或向 UI 暴露 `Entry.getData()`。
- zip.js entry 必须立即映射为项目内部的只读元数据对象，UI 和其他模块不得持有原始 zip.js `Entry`。
- 不注册 codec，不生成或请求 zip.js Worker/WASM 资产。ZIP 加密目录、分卷目录和任何需要读取 local entry payload 的能力保持不支持。
- 如果升级 zip.js，必须重新执行读取范围审计、真实 ZIP 兼容性测试和生产 bundle 体积检查，不能只依赖语义化版本范围。

选择 zip.js 而不是自行实现 ZIP 中央目录，是为了复用 ZIP64、extra fields、Unicode/CP437 文件名和异常目录处理；选择 `zip-core-custom` 而不是完整入口，是为了不把写入、解压引擎、Worker 和 WASM 带入本插件。

基于 `2.8.60` 的选型基线如下。浏览器体积使用 esbuild 0.25.9 进行 ESM tree-shaking 和 minify 后再以 gzip level 9 测量；Next.js 最终产物仍以项目的生产构建结果为准。

| 形态 | 原始/压缩后体积 | gzip 体积 |
|---|---:|---:|
| npm tarball | 2.16 MB | — |
| 完整 npm 包解包后 | 7.58 MB / 110 文件 | — |
| 完整预构建 `dist/zip.min.js` | 144.8 KB | 65.6 KB |
| 无内嵌 Worker/WASM 的 `dist/zip-core.min.js` | 92.1 KB | 34.6 KB |
| 根入口仅导入 `ZipReader` 并 tree-shake | 108.4 KB | 51.8 KB |
| `lib/zip-core-reader.js` 仅导入 `ZipReader` | 53.0 KB | 20.5 KB |
| 选定的 `lib/zip-core-custom.js` 导入 `ZipReader + Reader` | 55.3 KB | 21.6 KB |

上述 npm 安装体积不会直接发送给浏览器。选定入口只进入动态加载的归档插件 chunk，不得进入 `/view` 初始包。zip.js 没有“仅解析中央目录、完全删除 `Entry.getData()`”的官方入口，因此读取审计仍是采用该依赖的硬性门禁。

参考：[zip.js bundle size](https://gildas-lormeau.github.io/zip.js/#bundle-size)、[ZipReader API](https://gildas-lormeau.github.io/zip.js/api/classes/ZipReader.html)。

#### TAR 与压缩包装格式

- TAR/ustar/PAX/GNU 元数据由项目直接按格式规范解析，只实现当前计划列出的记录类型。
- gzip、xz、zstd、bzip2、LZ4 frame、zlib 等由项目直接解析固定头部、尾部和索引字段。
- 使用浏览器 `DataView`、`TextDecoder` 和少量有边界检查的二进制读取辅助函数，不引入通用二进制解析框架。
- CRC32 等只针对已读取的元数据区域实现小型校验函数，不读取文件体补算校验。
- 现有 `fflate` 可以继续作为开发依赖生成测试 fixture，但不得进入插件运行时依赖。
- 以后支持独立压缩目录头时，可以为该格式引入精确锁定的 codec-only 依赖；不得自行实现压缩算法，也不得因此引入通用归档引擎。

### UI

- 单一页面展示“识别结果、容器/包装层、头尾/索引字段、条目列表、能力与限制”。
- 有目录信息时使用扁平条目表，不在第一阶段实现虚拟树、目录折叠或拖拽交互。
- 条目表按固定页大小分页，支持名称过滤；避免一次创建大量 DOM，也不引入虚拟列表依赖。
- 默认列为路径、类型、原始大小、压缩后大小、修改时间和方法；未知值显示 `—`。
- 没有目录信息时不显示空表，改为说明该格式只有包装层元数据或为什么不能扫描内部目录。
- 路径只通过 `textContent` 显示；保留原始名称供检查，并标记 `../`、绝对路径等危险路径。
- 默认使用宿主滚动模式。只有后续确实引入虚拟列表时，才改为符合渲染规范的单一内部滚动容器。

### 资源与错误

- 中央目录、索引和累计读取的元数据最多 64 MiB；独立压缩目录头解码后最多 64 MiB。
- 最多解析 10 万条记录，单路径最多 16 KiB，累计路径文本最多 32 MiB。
- 超限返回 `resource-limit`，已经解析的部分不伪装成完整结果。
- 空文件、截断头尾、非法偏移和字段越界返回 `invalid-file`。
- 加密目录、分卷文件或需要解码 payload 才能取得目录时，展示可理解的“不支持”说明，不尝试绕过。
- `AbortSignal` 在每次异步读取和批量解析之间检查；`dispose()` 幂等，清理当前实例 DOM，取消后不再报告进度或更新 UI。

## 测试与验收

### 格式正确性

- 为第一阶段每种格式提交最小真实 fixture，校验扩展名、复合后缀、magic、实际格式和可用字段。
- ZIP 覆盖空包、ZIP64、重复路径、Unicode/非 UTF-8 名称、注释、危险路径、加密条目标志和截断中央目录。
- TAR 覆盖 ustar、pax、GNU TAR、长路径、符号链接、稀疏记录、非法大小和截断头部。
- 压缩包装格式覆盖可选字段缺失、错误后缀、截断头尾和未知字段值。

### 不读取条目数据

- fixture 生成时分别记录格式元数据区间和普通文件条目 payload 的精确字节区间。
- 读取审计必须断言 ZIP 只读取识别区、尾部和中央目录，读取范围不与任何普通文件 entry payload 相交。
- TAR 只允许读取固定头部和有明确类型标记的 PAX/GNU 元数据记录；普通文件体必须通过偏移跳过，读取范围不得与之相交。
- `.tar.gz`、`.tar.xz`、`.tar.zst` 必须只读取外层格式所需范围，测试断言没有启动 TAR 解析器，也没有解码压缩数据流。
- 独立压缩目录头的未来解析器必须证明 codec 输入全部位于格式定义的元数据区间，且输出受资源上限约束。
- 任何解析器都不得调用整文件 `arrayBuffer()`，测试用受控 `Blob` 记录并验证所有 `slice()` 范围。

### UI、生命周期与构建

- 大条目 ZIP/TAR 只渲染当前页，DOM 数量不随总条目数线性增长。
- 验证过滤、翻页、超宽路径、窄窗口和矮窗口下的滚动与键盘焦点。
- 验证读取中取消、重复 `dispose()`、格式错误、资源超限和 container 外 DOM 不受影响。
- 更新注册顺序与复合后缀测试，确认 DOCX/XLSX 等仍默认使用现有专用插件。
- 通过 `npm test`、`npm run lint`、`npm run build` 和首包 marker 检查；生产产物不得新增 zip.js Worker 或 WASM 资产。
- 记录归档插件动态 chunk 的 gzip 体积，并与上述 zip.js 选型基线核对；体积明显偏离时先检查错误入口和 tree-shaking。
- 使用 Chrome、Edge、Firefox 和 Safari 的真实文件完成手动冒烟测试。
- 所有新增代码文件低于 600 行；只有在职责真实独立时拆分文件。

## 完成标准

第一阶段完成必须同时满足：

1. ZIP/ZIP64 和未压缩 TAR 能展示条目元数据。
2. 列出的纯压缩格式能展示可直接取得的包装层元数据。
3. 复合压缩 TAR 明确不扫描内部目录。
4. 自动化读取审计证明没有读取或解码任何普通文件条目 payload。
5. 不包含 libarchive、通用 WASM 解压引擎或未被当前格式需要的基础设施。
6. 插件加载、生命周期、UI 和生产构建符合现有查看器规范。
