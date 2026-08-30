# 开发者产物支持矩阵

本表只登记已经存在可运行路径的能力。`implemented` 表示 Manifest、probe、严格 `open()` 和 UI 已落地；`verified` 表示正常、伪装、损坏、截断、资源上限和生命周期证据已经进入自动测试。后续阶段的原生二进制等格式在实现前不写入本表。

| format | plugin | level | implemented | verified | fixture |
|---|---|---:|:---:|:---:|---|
| ZIP 与 `.jar` `.war` `.ear` `.whl` `.nupkg` `.snupkg` | `archive-metadata-viewer` | 2 | yes | yes | `viewer/plugins/archive/examples/archive.zip`；测试生成伪装、截断、ZIP64、重复路径和超大目录 |
| `.egg` `.pyz` `.pyzw` | `archive-metadata-viewer` | 2 | yes | yes | `package.egg`、`application.pyz`、`application.pyzw` 及对应 `disguised.*` |
| TAR | `archive-metadata-viewer` | 2 | yes | yes | `archive.tar`；测试生成 PAX、GNU longname、负时间、损坏大小和截断头 |
| gzip + TAR：`.tar.gz` `.tgz` `.crate` | `archive-metadata-viewer` | 2 | yes | yes | 首开会顺序解压到 TAR 目录结束，延迟随到目录末尾前的压缩内容线性增长；`archive.tar.gz`、`package.tgz`、`package.crate` 及对应伪装样例；测试覆盖实际解压输出、声明大小和压缩比上限 |
| JMOD | `archive-metadata-viewer` | 2 | yes | yes | `module.jmod` 与 `disguised.jmod` |
| RAR 4/5 | `archive-metadata-viewer` | 2 | yes | yes | `archive.rar`；固定 RAR4/5、SFX、加密头、损坏 CRC 与截断 fixture |
| gzip、XZ、Zstandard、bzip2、LZ4、zlib wrapper | `archive-metadata-viewer` | 1 | yes | yes | `sample.gz`、`sample.xz`、`sample.zst`、`sample.bz2`、`sample.lz4`、`sample.zlib` |
| raw DEFLATE、Brotli | `archive-metadata-viewer` | 1 | yes | yes | `sample.deflate`、`sample.br`；裸流只展示可诚实取得的检查信息 |
| NPY 数值、布尔、字符串、Unicode、复数与结构化数组 | `dev-array-viewer` | 3 | yes | yes | `viewer/plugins/dev-array/examples/matrix.npy`；测试生成大小端、C/Fortran order、分页、结构化和截断 fixture |
| NPY object dtype | `dev-array-viewer` | 1 | yes | yes | `objects.npy`；恶意 Pickle 形状文本保持未读取、未执行 |
| NPZ 目录 | `dev-array-viewer` | 2 | yes | yes | `arrays.npz`；测试覆盖伪装 ZIP、损坏目录、条目数和目录大小门禁 |
| NPZ 中选中的普通 NPY 数组 | `dev-array-viewer` | 3 | yes | yes | `arrays.npz`；stored 使用 range read，DEFLATE 只流式解到选中页，测试覆盖异常压缩比 |
| WebAssembly `.wasm` | `dev-wasm-viewer` | 2 | yes | yes | 测试生成含 type、import、function、memory、export、start、custom 和 code section 的确定性模块；覆盖伪装、版本、损坏 LEB128、越界 section、异常数量和截断 |
| ECMA-426 source map `.map` | `dev-source-map-viewer` | 3 | yes | yes | `viewer/plugins/dev-source-map/examples/sample.js.map`；测试覆盖普通 / indexed map、内嵌源码、ignore list、位置查询、损坏 JSON / VLQ、外部 section 禁止联网和资源上限 |
| DuckDB `.duckdb` `.ddb` | `duckdb-data` | 3 | yes | yes | 现有 DuckDB session / 分页 UI 测试；probe 测试覆盖等级、其他数据格式回退和取消 |

## 样例与门禁

- 可生成样例由各插件的 `scripts/generate-examples.mjs` 创建并提交生成结果；样例只含确定性的合成内容。
- 二进制测试共用 `@anyfile/viewer-test` 的 fixture helpers；`dev-array-viewer` 与 `dev-wasm-viewer` 共用 `@anyfile/dev-binary-core` 的可取消 range read、边界检查和 ULEB cursor。
- probe 只读取有界头部、尾部或首个解压 TAR header，并传播 `AbortError`；完整 parser 和 DOM 不进入 probe 模块。
- 归档目录不执行包内脚本、JAR class、assembly 或 PHAR stub。NPY object dtype 不读取或调用 Pickle；WASM 不实例化，source map 不请求外部 source 或 section URL。
- ZIP/TAR 路径长度、累计路径文本、条目数量和目录字节数均有限制；路径穿越名称仅作为文本显示并标记，不写入文件系统。
