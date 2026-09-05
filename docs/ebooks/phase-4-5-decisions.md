# 阶段 4–5：实际实现与方案调整

2026-09-05。阶段 4 交付 `mobi-reader`（等级 3）；阶段 5 扩展 `comic-book-reader` 的 CBT、CBR 与 CB7（等级 4）。运行路径已实现，固定组合的浏览器验收与测量见 [验证记录](verification.md)。未覆盖变体不因扩展名相同就被写成 verified。

## 选型

| 方案 | 核查与决定 |
|---|---|
| 自写 TypeScript MOBI/KF8 | 未采用。PalmDOC 本身很小，但 Huffman 字典、KF8 skeleton/fragment、双格式、资源引用和目录重建会形成新的复杂解析器维护负担。 |
| foliate-js 1.0.1 的 mobi.js | MIT；核查实际 npm 源码。其公开 `open()` 连同 MOBI6/KF8 的 DOMParser、XMLSerializer、文档和资源缓存初始化，不能作为无 DOM、可终止的纯 parser 直接放进 Worker。为接入而模拟浏览器 DOM 或长期 patch 缓存/解压边界，收益低于独立 decoder；没有加入依赖。 |
| libmobi 0.12 / `906274205c11944b628da1c553b255acb1af7c55` | 采用。单独的 Worker 动态加载可替换 JS/WASM 模块；关闭 `USE_ENCRYPTION`、词典解析和外部 libxml2，使用上游 internal xmlwriter/miniz。负责 PalmDOC、Huffman、MOBI7/KF8 重建，项目负责路由、预算和安全内容显示。 |
| libarchive-wasm 1.2.0 npm 包 | 未采用。公开 wrapper 的 `read_new_memory` 开启所有格式/过滤器，`read_next_entry` 没有向调用者区分完整错误状态；包不满足精确裁剪、当前上游安全版本和逐块累计读取边界。 |
| libarchive 3.8.9 + liblzma 5.8.3 | 采用源码构建。仅注册 RAR4、RAR5、7z reader；链接器删除未调用 writer/格式/压缩模块。没有开放文件系统提取、归档写入、密码或网络 API。ZIP 与 TAR 不走这套 WASM。 |
| CBT | 使用小型 USTAR reader，校验 checksum、路径、类型、大小和数量，按 `File.slice()` 读取选中图片。暂不实现 GNU longname、PAX、稀疏文件、符号/硬链接。 |

上游依据：[libmobi releases](https://github.com/bfabiszewski/libmobi/releases)、[Foliate JS](https://github.com/johnfactotum/foliate-js)、[libarchive 3.8.9](https://github.com/libarchive/libarchive/releases/tag/v3.8.9)。libmobi 0.12 已包含此前 0.11 的恶意输入修复；libarchive 选用当前核查到的 3.8.9，未使用 npm 候选所带的旧运行时。此审核不是对所有未来漏洞或全部格式的保证；升级必须重新执行源码/组合测试。

## LGPL 分发决定

不把 LGPL 问题作为永远未决的标记，也不把 LGPL 代码混入网站主包。`libmobi` 与 C adapter 独立分发，保留 LGPLv3、GPLv3、完整对应上游 source archive、adapter、精确下载哈希和重建脚本。应用通过明确的 C API 调用模块。模块可被用户修改、替换和为调试修改而逆向工程；浏览器没有拒绝替换版本的签名校验。普通 prepare 的校验只保护应用构建输入。

`SOURCE.md` 和对应源码链接通过插件介绍页公开。大约 4.8 MiB 的完整源码归档放在 `/vendor/licenses/libmobi/0.12-anyfile.1/`，仅应用户下载时传输，不属于阅读器冷启动。应用本身继续使用 Apache-2.0；模块和 adapter 使用其 LGPL-3.0-or-later 许可证。

两套构建配方在 `tools/ebook-decoders-build/`，审核产物在 `third_party/`，prepare 从已校验产物恢复 `public/vendor/`。使用 Emscripten 3.1.69、原生 macOS arm64 工具链，无浮动容器。两个独立临时目录构建出的 JS/WASM 四个文件完全一致，见 [哈希证据](evidence/decoder-reproducibility.json)。应用 test/build 不编译 C，也不下载上游源码。

## 对原阅读架构的调整

### MOBI

- Probe 只读取 PDB 头与首 record 的有界信息；`.pdb`/`.prc` 只接受 `TEXtREAd` 或 `BOOKMOBI`，不接管任意 Palm 数据库或 KFX。
- 打开时严格检查 record table：数量、单调偏移、文件范围、每 record 大小；Worker 再重复验证输入。加密标记返回稳定不支持 UI，不调用解密功能。Print Replica 和词典同样明确不支持。
- 联合文件交给 libmobi 选择 KF8，按重建 `partNNNNN.html` 顺序建立 spine；OPF/NCX 提供 metadata、方向和目录。不会把 MOBI7 与 KF8 正文串起来显示。
- decoder 有界重建一次，编码后的正文/资源留在 Worker；主线程只取当前和邻近章节资源。原方案的“大书首屏永不等待整书重建”不能在此上游架构下兑现，明确以输入/文本/内存/时间上限换取可靠重建。
- KF8 的重建 part 是章节单位；MOBI7 常重建为单个 HTML part，目录按内部 anchor 导航，因而长 MOBI7 还受到单 part 2 MiB 上限。没有假装实现记录级随机正文访问。
- PalmDOC 是纯文本，不作为 HTML 解释；换行与尖括号保留。旧式 HTML 中 `font`/`center` 保留内容，自闭合 `mbp:pagebreak` 在惰性解析前规范化为分隔线，避免 HTML 把后续章节嵌入并丢弃。
- 将 EPUB 已有的 HTML/CSS/图片清理器和无格式依赖的 markup 辅助函数提到 `rendering-publication` 窄子入口。MOBI 不导入 EPUB parser，FB2 仍使用自身结构映射。原始 HTML 只解析到惰性 template；最终 iframe 仍禁止脚本/网络/表单/外部导航。
- 等级为 3：正文、阅读顺序、目录、metadata 和常见图片可用，但 MOBI7 的字号/排版、复杂 KF8 CSS、字体、固定布局、音视频并不等价于 Kindle 原生显示。不得称为完整 Kindle 支持。

### 漫画

只提取 `BookSource`（entries/read/dispose）窄接口，继续复用原漫画 model/viewport；没有因为新增容器再造一套漫画 UI，也没有提前建立无人需要的 `rendering-comic` 包。

ZIP/USTAR 保持按 entry 切片读取。RAR/7z 使用一次性顺序解压，逐 64 KiB 计数并校验实际长度/CRC，保留需要的编码图片与 ComicInfo，释放 decoder 原生结构。之后随机跳页直接读取 Worker 内的编码页，不重复扫描固实归档。页解码和 Object URL 仍按最多四页活跃窗口控制。

这不是无限大固实归档的随机访问。打开前有一次完整展开成本；超过 64 MiB 压缩输入或 128 MiB 总展开量会停止。无论用户跳到第几页，都不能触发反复全书解压。CBR/CBT 与通用 archive 的等级竞争有自动测试；CB7 只有专用阅读器和 hex，通用 archive 未实现 7z，不能虚构其备选能力。

## 资源预算

| 项目 | 上限/策略 |
|---|---:|
| MOBI 输入 / text header / record count / 单 record | 64 MiB / 32 MiB / 10,000 / 16 MiB |
| MOBI 重建输出（Worker 保留编码资源） | 累计 64 MiB；单 part 最多 32 MiB，显示时章节仍限 2 MiB |
| 章节 DOM / 深度 / 当前及邻章 | 20,000 / 64 / 最多 3 章 |
| RAR/7z 输入 / 总实际展开 | 64 MiB / 128 MiB；最高 1000:1（小于 1 KiB 按 1 KiB 计） |
| RAR/7z entries / 单 entry / 单图片 | 10,000 / 32 MiB / 16 MiB |
| TAR 输入 / entries | 2 GiB / 10,000；最多读取 5 MiB 头部块 |
| 每种 native decoder | 初始 16 MiB、最多 256 MiB WASM memory，1 MiB stack |
| 单 Worker 请求耗时 | 60 秒；达到时终止 Worker 并返回 resource-limit |
| 漫画页 / 单页像素 / 活跃页面 | 5,000 / 800 万（动画按帧计）/ 最多 4 页 |

WASM memory 的增长上限不是总浏览器内存上限；还存在原文件、JS 编码页缓存、消息副本、主线程 DOM 和原生图片/GPU 内存。解码期间 JS 输入/输出与 WASM 可以同时存在。JS heap 与 WASM heap 分开记录，不把 heap 数字当作 GPU/进程峰值。

opening/active abort 和 dispose 都终止 Worker。单页预取取消只丢弃该页结果，不能破坏另一个仍需要的页；整个文件取消则立即终止同步 native 解码。Worker 结束后其编码资源随上下文释放；DOM/iframe/图片 URL 由既有视口清理。
