# 需求池

每行一个需求：`- [状态] 难度 | 需求 | 备注`。越靠上优先级越高。

- 状态：`[ ]` 待做，`[x]` 已合并到 dev，`[!]` 受阻（备注写原因）。
- 难度：`低`（一天内、无新运行时）、`中`（新解析器或较多 UI）、`高`（自建 WASM、大型依赖或跨多个插件）。
- 备注：可选，一句话。来源证据、受阻原因、完成提交写在这里，不另建文档。

流程规则见：
- 每日开发：`docs/agent-daily-dev.md`
- 每周需求评估：`docs/agent-weekly-demand.md`
- 每周 review：`docs/agent-weekly-review.md`

## 需求
- [x] 低 | 在 `@anyfile/runtime-assets` 中抽取共享 Worker RPC 客户端 | 20+ Worker+WASM 插件重复编写请求 ID 关联、超时、`AbortSignal` 终止、transferable 与运行时回退逻辑（如 `djvu/src/worker-client.ts` 近 200 行）；抽为轻量类型化 `createWorkerRpcClient` 减少泄漏与取消竞态。2026-11-23 迁移 djvu/postscript/general-raster/photoshop，工厂与单测见 `viewer/runtime-assets/src/worker-rpc.ts` 2026-11-23 7c38d60
- [x] 中 | 构建版本化 Service Worker 与有界缓存淘汰 | 构建阶段注入 build ID，将 `/_next/static/*` 拆入 `anyfile-next-static-<buildId>` 以便发版激活时自动清理旧块，并为 `anyfile-runtime-v1` 增加有界 LRU 淘汰与满额恢复 2026-11-24 bc9775e
- [x] 中 | 右上角中英文切换时，会丢失已经打开的文件和工作区状态. | 语言选择器改为客户端软导航（同 document 重挂载），经 `src/lib/workspace-session.ts` 在内存内传递 File/FileSystemHandle 引用恢复已打开文件与文件树；embed 保持隔离，待人工浏览器验收 2026-11-25 10f94d0
- [x] 低 | 抽取共享插件 IO / Abort / Lifecycle 工具并补齐协议 `runtime-unavailable` 与 `reportPreview` 约束 | 收敛 14 份 `read-blob` / 48 处 `abortError` 重复实现并支持渐进读头，在 `@anyfile/viewer-protocol` 新增 `runtime-unavailable` 区分运行时拉取失败与环境不支持，补齐新插件 `reportPreview` 约束。2026-11-25 4098067
- [ ] 中 | 基于单点声明派生插件接线投影 | 收敛新增插件时的多点手工同步面（`src/content/manifests.ts`、`file-type-icon.tsx`、`src/lib/pwa/file-handlers.ts`、`docs/domains/*.md` 等），保持 `manifest.ts` 纯净与首包隔离边界
- [x] 高 | 抽取共享分页文档视口适配器（`PagedDocumentSource`） | `djvu` 与 `pdf` 各自实现 ~500–1000 行分页画布工具栏、缩放/适应、画布淘汰与大纲侧栏；抽到共享包（先从 `djvu` 抽起，再视情况迁 `pdf`）以复用至后续分页格式（TIFF/XPS/PostScript 等）；2026-11-23 2f8dc80
- [ ] 低 | 修复 `createTrackedFile` 在 Node 26 下对池化 `Buffer` 切片越界导致 `djvu` 单测失败 | `viewer/testing/src/index.ts` 中 `bytes.slice().buffer` 会取到 Node 池化 Buffer 的共享底层缓冲区；需改为独立拷贝并核对本地/CI Node 版本一致性
- [x] 高 | 新增 OFD 版式文档查看器（`.ofd`） | 中国电子发票、政务公文与电子合同标配，macOS/Windows/浏览器原生完全打不开，只能装专用客户端且发票合同高度隐私不敢上传；需支持固定版式矢量、嵌入字体与电子签章展示；新插件 `ofd` 纯 JS 渲染模板/图层/复合图元/图案到共享分页 Canvas 视口，TrueType 轮廓与资源缓存抽到 `@anyfile/viewer-rendering/fixed-layout`（与 xps 共用），签章从 SES 签名值取 PNG 或嵌套印章 OFD，不验签，待人工浏览器验收 2026-11-23 648457e
- [x] 高 | 新增 Outlook 邮件归档查看器（`.pst` / `.ost`） | 高频搜 `open pst without outlook` 与 Mac 打开 `.pst`，离职交接、老电脑备份与法务审计常见数百 MB 至数 GB 邮件库，全量隐私绝对不敢上传；需按需随机读取目录树、分页列表与附件；新插件 `outlook-pst` 自研 MS-PST NDB/LTP/消息层经 `Blob.slice` 随机读取，支持 ANSI/Unicode/2013+ 4K 压缩 OST、HTML 沙箱正文（拦截远程引用）、LZFu RTF 与附件保存，待人工浏览器验收 2026-11-23 6aefce5
- [x] 高 | 新增科学多维数据容器查看器（`.h5` / `.hdf5` / `.nc` / `.nc4` / `.mat`） | AI/科研/气象/遥感/工程高频搜 `hdf5 viewer online` 与 `open mat without matlab`，文件常达数百 MB 且涉密不愿上传；需按需浏览分组树、属性元数据、大数组切片表与 2D 切片预览；新插件 `scientific-data` 使用 `h5wasm` Worker+`WORKERFS` 按需读取 HDF5/NetCDF-4/MATLAB v7.3，纯 TS 按需读取 NetCDF Classic/64-bit/CDF-5 与 MATLAB Level 4/5，含分组树、属性表、N 维切片表与 2D Canvas 热力图预览，待人工浏览器验收 2026-11-25 7146bcf
- [x] 高 | 新增 OpenEXR / HDR 高动态范围图像查看器（`.exr` / `.hdr`） | 影视后期、3D 渲染与游戏开发高频搜 `exr viewer online`，浏览器原生打不开且在线工具常压成 8-bit；需支持多通道（AOV）切换、曝光/Gamma/色调映射调节与 360° HDRI 环境球预览；新插件 `hdr-image` 纯 TS Worker 解码线性 Float32（OpenEXR 扫描线/分块/多 Part、None/RLE/ZIPS/ZIP/PIZ/PXR24/B44、多通道 AOV 与 Radiance RGBE/XYZE），支持实时曝光/Gamma/ACES 等色调映射、悬停线性像素读数与 360° WebGL 环境球预览，待人工浏览器验收 2026-11-25 fd5f98f
- [ ] 高 | 新增设计源文件查看器（`.fig` / `.sketch`） | 研发/产品/Windows 用户高频搜 `open sketch on windows` 与 `fig file viewer`，无 Mac 或付费账号打不开客户/离职设计师发来的涉密稿件；需支持画板浏览、图层树与文字/尺寸检查
- [ ] 高 | 新增通用 3D 场景与高斯泼溅查看器（`.usdz` / `.usd` / `.usdc` / `.splat` / `.spz`） | Windows/Android 原生打不开 Apple AR `.usdz`（当前仅 `archive` 列 ZIP 目录），3D Gaussian Splatting 正成空间计算与 3D 扫描主流；需支持 3D 场景交互渲染与高斯泼溅实时浏览
- [ ] 高 | 新增 GB 级超大日志与结构化文本流式查看器 | 排查故障时打开数 GB `.log`/`.jsonl`/`.csv` 极易卡死浏览器与普通编辑器，且日志含敏感业务数据不能上传；需秒开、虚拟滚动、流式正则搜索过滤与日志级别高亮
- [ ] 高 | 实现本地分屏文件对比（Side-by-Side Diff） | 法务/财务/研发/设计师高频需免上传对比两份敏感文件（PDF/DOCX 文档、表格、图片/PSD 卷帘与像素差值、代码/JSON）；跨插件复用现有渲染器，打造强差异化平台能力
- [ ] 中 | 新增邮件查看器（`.eml` / `.msg`） | 解析 RFC 5322 MIME 与 Outlook CFBF `.msg`，展示安全清理正文与附件清单；无 Outlook 打开 `.msg` 搜索痛点极强，邮件高度隐私敏感不愿上传
- [ ] 中 | 新增 Microsoft Access 数据库查看器（`.mdb` / `.accdb`） | `open mdb/accdb online` 与 macOS 查看 Access 搜索痛点极强（Mac/Linux 无原生软件，数据库高度机密）；基于纯 JS `mdb-reader` 读取表结构与分页数据
- [ ] 中 | `archive-metadata-viewer` 补齐 `.7z` 归档目录查看 | 复用或抽取 `comic-book` 已有的 `comic-archive` libarchive WASM，无需新构建；macOS 与浏览器原生打不开 `.7z`，搜索需求高
- [ ] 中 | 新增网络抓包查看器（`.pcap` / `.pcapng`） | 解析包头与常见 TCP/UDP/DNS/HTTP 摘要、筛选与载荷检查；排查问题常需安装 Wireshark，流量数据极度敏感不愿上传
- [ ] 中 | 新增地理轨迹与矢量数据查看器（`.geojson` / `.gpx` / `.kml` / `.shp`） | 纯本地 2D 坐标投影与属性表展示（不请求在线地图瓦片）；替代 QGIS / Google Earth，符合 `选格式.md` 地理数据免上传场景
- [ ] 低 | `ffmpeg-video` 补齐 `.flv`（Flash Video）播放 | `docs/domains/videos.md` 未实施项；现有 `ffmpeg-playback` WASM 已编入 `flv` demuxer/decoder（见 `tools/ffmpeg-playback-build/evidence/configure.txt`），补有界 probe、样例与注册即可免装桌面播放器
- [x] 低 | 新增 Apple 属性列表查看器（`.plist`） | Windows/Linux 与浏览器打不开二进制 `bplist00`，`plist viewer online` 需求稳定且常含应用配置不便上传；纯 JS 解析 `bplist00`/XML 为树形与 JSON 视图，无新运行时。新插件 `apple-plist` 自研二进制 trailer+对象表解码器与 XML 分词器，可展开树 + 即时筛选 2026-11-24 2e5f2ba
- [ ] 低 | 新增 OpenRaster / Krita 分层设计图预览（`.ora` / `.kra`） | `docs/domains/images.md` 未实施项；规范自带 `mergedimage.png` 与 `stack.xml` 图层树，复用现有 ZIP 与 `@anyfile/viewer-rendering` 无新运行时即可替代 Krita/GIMP 预览
- [x] 高 | 新增 Apple iWork 文档与演示查看器（`.pages` / `.key`） | Windows/Linux 原生完全打不开 Mac 发来的 `.pages`/`.key`（当前仅 `excel` 支持 `.numbers`），搜索需求极大；需解析 IWA（Snappy+Protobuf）或自建 `libetonyek` WASM 渲染版式；新插件 `iwork` 自解析 IWA 提取文本/缩略图/备注（不渲染版式），兼容嵌套 Index.zip 与 iWork '09 XML 2026-11-22 7fd9310
- [x] 高 | 新增统计软件数据查看器（`.sav` / `.dta` / `.sas7bdat`） | 科研/医疗/金融高频搜 `open sav without spss` 与 `sas7bdat/dta viewer`，数据严格保密不愿上传；需按 `tools/` 配方将 C 库 `ReadStat` 编为 WASM，支持变量/值标签与大表分页；新插件 `stat-data` 自建 ReadStat 1.1.9 WASM 按需读文件，另含 `.zsav`/`.por`/`.xpt` 2026-11-22 fc48693
- [x] 高 | 新增 Microsoft XPS 固定版式查看器（`.xps` / `.oxps`） | Win10/11 默认移除 XPS 查看器且 macOS/Linux 无原生支持，常见于发票/税务/医疗打印件极度敏感；优先采用 ZIP + FixedPage XAML 固定版式渲染管线（避免引入 AGPLv3 协议的 MuPDF WASM）；新插件 `xps` 纯 JS 解析 FixedPage 并自读 TrueType 字形轮廓绘制到共享分页 Canvas 视口，待人工浏览器验收 2026-11-23 6447fc6
- [ ] 高 | 新增 CorelDRAW 矢量文件查看器（`.cdr`） | 印刷/设计行业搜 `open cdr without coreldraw` 痛点极强（软件昂贵且偏 Windows，设计稿涉密）；需自建 `libcdr`+`librevenge` WASM 配方渲染矢量页
- [ ] 低 | 校准开发者与数据类格式页的 `typicalLevel` 支持等级 | 核对并统一 `torrent`、`safetensors`、`gguf`、`wasm`、`map`、`npy`/`npz`、`duckdb`、`har` 等格式页的 `typicalLevel`，使其与实际 `probe()` 返回值及 `docs/domains/` 支持矩阵一致
- [ ] 低 | 为缺少真实样例的插件补 `examples/`，逐个移出 check-repo 的 PLUGINS_WITHOUT_SAMPLES | 先做 code、sqlite、hex、dev-wasm 等易获得样例的
- [ ] 低 | 为 `ffmpeg-video` / `ffmpeg-audio` 补齐站点插件页与格式页，并移出 `scripts/check-repo.mjs` 的 UNPUBLISHED_PLUGINS | 两个回退插件当前仅注册未发布站点页面，补齐后完善插件目录与格式覆盖统计
- [ ] 高 | 重新设计samples管理和展示. 现在有一些格式页自带sample, /en/view页面左栏上还有个samples按钮里面只有几个图片samples, 用合理的方式重新设计吧.
- [ ] 高 | 新增 GPU 纹理查看器（`.dds` / `.ktx` / `.ktx2`） | `docs/domains/images.md` 未实施项；游戏与 3D 资产开发高频痛点，需引入 Khronos/Basis WASM 转码并支持 mipmap、cubemap 与通道检查
- [ ] 高 | 新增医学/科学体数据查看器（`.nii` / `.nii.gz` / `.nrrd`） | `docs/domains/images.md` 未实施项；科研/医疗影像高度敏感不愿上传，需三视图切片与窗宽窗位，替代 3D Slicer 等大型桌面软件
- [ ] 高 | 实现 ZIP 归档内文件按需点击预览（跨插件复用） | 在 `archive-metadata-viewer` 中点击未加密 ZIP 内图片/PDF/代码/表格时按需流式解压并复用对应查看器，涉及工作区协议与跨插件协作
- [ ] 中 | 抽取 dji-osmo / gopro-max / insta360 的双轨播放与全景渲染到共享包 | DJI 与 GoPro playback 约 375 行仅 64 行不同；需人工浏览器验收三种相机样例


## 待处理建议
在每日开发 Agent的执行过程中发现的问题, 更新在这个下方, 每周会经过评估和确认后加入需求池.
