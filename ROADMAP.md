# 需求池

每行一个需求：`- [状态] 难度 | 需求 | 备注`。越靠上优先级越高。

- 状态：`[ ]` 待做，`[x]` 已合并到 dev，`[!]` 受阻（备注写原因）。
- 难度：`低`（一天内、无新运行时）、`中`（新解析器或较多 UI）、`高`（自建 WASM、大型依赖或跨多个插件）。
- 备注：可选，一句话。来源证据、受阻原因、完成提交写在这里，不另建文档。

规则：

- **每日开发 Agent**：领取最靠上的 `[ ]` 条目；合并到 dev 时把条目改为 `[x]`，备注末尾加 `<YYYY-MM-DD> <commit>`。
- **每周调研 Agent**：只追加或修改 `[ ]` 条目。追加前确认格式未被支持（`grep -rn '"\.<ext>"' viewer/plugins/*/src/manifest.ts`）且池中没有重复；备注写需求证据（搜索量、论坛求助、只能靠大型桌面软件打开等）。按项目思路排序：格式多优先于支持深，优先有明确需求但只能依赖大型桌面软件的格式。
- **每周 review**：调整顺序和难度，处理 `[!]` 条目，删除已随 main 发布的 `[x]` 条目（历史在 git 中）。

## 需求
- [ ] 高 | 清理和简化docs/
- [ ] 高 | 扩展 `@anyfile/viewer-ui` 为共享 Inspector UI Kit 与主题变量契约 | 37/52 插件手写 `<style>` 与重复壳层/键值表/筛选栏且暗色模式易失配；补齐 `--viewer-muted`/`--viewer-surface` 等 token 及轻量可组合原语（shell、KV 列表、数据表、`el()`、`formatBytes()`），新插件优先采用
- [ ] 高 | 拆分插件策略配置与接线元数据（`viewer/plugin-policies.json`、`src/lib/viewer-protocol.test.ts`） | 52 个插件已使 `plugin-policies.json` 达 840 行（逼近 1000 行门禁上限）、`viewer-protocol.test.ts` 达 598 行，且并行新增插件易在 6–7 个中心文件冲突；按插件拆分策略并分离协议契约与路由测试
- [ ] 低 | 在 `@anyfile/runtime-assets` 中抽取共享 Worker RPC 客户端 | 20+ Worker+WASM 插件重复编写请求 ID 关联、超时、`AbortSignal` 终止、transferable 与运行时回退逻辑（如 `djvu/src/worker-client.ts` 近 200 行）；抽为轻量类型化 `createWorkerRpcClient` 减少泄漏与取消竞态
- [ ] 高 | 抽取共享分页文档视口适配器（`PagedDocumentSource`） | `djvu` 与 `pdf` 各自实现 ~500–1000 行分页画布工具栏、缩放/适应、画布淘汰与大纲侧栏；抽到共享包（先从 `djvu` 抽起，再视情况迁 `pdf`）以复用至后续分页格式（TIFF/XPS/PostScript 等）
- [ ] 高 | 完成 `docs/pwa-desktop-app.md`
- [ ] 中 | 新增邮件查看器（`.eml` / `.msg`） | 解析 RFC 5322 MIME 与 Outlook CFBF `.msg`，展示安全清理正文与附件清单；无 Outlook 打开 `.msg` 搜索痛点极强，邮件高度隐私敏感不愿上传
- [ ] 中 | 新增 Microsoft Access 数据库查看器（`.mdb` / `.accdb`） | `open mdb/accdb online` 与 macOS 查看 Access 搜索痛点极强（Mac/Linux 无原生软件，数据库高度机密）；基于纯 JS `mdb-reader` 读取表结构与分页数据
- [ ] 中 | `archive-metadata-viewer` 补齐 `.7z` 归档目录查看 | 复用或抽取 `comic-book` 已有的 `comic-archive` libarchive WASM，无需新构建；macOS 与浏览器原生打不开 `.7z`，搜索需求高
- [ ] 低 | 新增 ML 模型权重头查看器（`.safetensors` / `.gguf`） | AI 开发者高频搜 `gguf/safetensors metadata viewer`，模型动辄数 GB 无法上传；纯 JS `File.slice()` 仅读文件头即可毫秒级展示架构、量化与张量形状，无新运行时
- [ ] 中 | 新增网络抓包查看器（`.pcap` / `.pcapng`） | 解析包头与常见 TCP/UDP/DNS/HTTP 摘要、筛选与载荷检查；排查问题常需安装 Wireshark，流量数据极度敏感不愿上传
- [ ] 中 | 新增地理轨迹与矢量数据查看器（`.geojson` / `.gpx` / `.kml` / `.shp`） | 纯本地 2D 坐标投影与属性表展示（不请求在线地图瓦片）；替代 QGIS / Google Earth，符合 `选格式.md` 地理数据免上传场景
- [ ] 低 | `ffmpeg-video` 补齐 `.flv`（Flash Video）播放 | `docs/domains/videos.md` 未实施项；现有 `ffmpeg-playback` WASM 已编入 `flv` demuxer/decoder（见 `tools/ffmpeg-playback-build/evidence/configure.txt`），补有界 probe、样例与注册即可免装桌面播放器
- [x] 低 | 新增 BitTorrent 种子查看器（`.torrent`） | `torrent file viewer online` 搜索量高，用户只想看内部文件树、大小与 Tracker 而不想装客户端或上传；纯 JS Bencode 解析与 WebCrypto 计算 infohash，无新运行时。2026-11-22 a859b74
- [ ] 低 | 新增 Apple 属性列表查看器（`.plist`） | Windows/Linux 与浏览器打不开二进制 `bplist00`，`plist viewer online` 需求稳定且常含应用配置不便上传；纯 JS 解析 `bplist00`/XML 为树形与 JSON 视图，无新运行时
- [ ] 低 | 新增 OpenRaster / Krita 分层设计图预览（`.ora` / `.kra`） | `docs/domains/images.md` 未实施项；规范自带 `mergedimage.png` 与 `stack.xml` 图层树，复用现有 ZIP 与 `@anyfile/viewer-rendering` 无新运行时即可替代 Krita/GIMP 预览
- [ ] 高 | 新增 Apple iWork 文档与演示查看器（`.pages` / `.key`） | Windows/Linux 原生完全打不开 Mac 发来的 `.pages`/`.key`（当前仅 `excel` 支持 `.numbers`），搜索需求极大；需解析 IWA（Snappy+Protobuf）或自建 `libetonyek` WASM 渲染版式
- [ ] 高 | 新增统计软件数据查看器（`.sav` / `.dta` / `.sas7bdat`） | 科研/医疗/金融高频搜 `open sav without spss` 与 `sas7bdat/dta viewer`，数据严格保密不愿上传；需按 `tools/` 配方将 C 库 `ReadStat` 编为 WASM，支持变量/值标签与大表分页
- [ ] 高 | 新增 Microsoft XPS 固定版式查看器（`.xps` / `.oxps`） | Win10/11 默认移除 XPS 查看器且 macOS/Linux 无原生支持，常见于发票/税务/医疗打印件极度敏感；需引入 MuPDF WASM 或 XAML 固定版式渲染管线
- [ ] 高 | 新增 CorelDRAW 矢量文件查看器（`.cdr`） | 印刷/设计行业搜 `open cdr without coreldraw` 痛点极强（软件昂贵且偏 Windows，设计稿涉密）；需自建 `libcdr`+`librevenge` WASM 配方渲染矢量页
- [ ] 低 | 为缺少真实样例的插件补 `examples/`，逐个移出 check-repo 的 PLUGINS_WITHOUT_SAMPLES | 先做 code、sqlite、hex、dev-wasm 等易获得样例的
- [ ] 低 | 为 `ffmpeg-video` / `ffmpeg-audio` 补齐站点插件页与格式页，并移出 `scripts/check-repo.mjs` 的 UNPUBLISHED_PLUGINS | 两个回退插件当前仅注册未发布站点页面，补齐后完善插件目录与格式覆盖统计
- [ ] 高 | 新增 GPU 纹理查看器（`.dds` / `.ktx` / `.ktx2`） | `docs/domains/images.md` 未实施项；游戏与 3D 资产开发高频痛点，需引入 Khronos/Basis WASM 转码并支持 mipmap、cubemap 与通道检查
- [ ] 高 | 新增医学/科学体数据查看器（`.nii` / `.nii.gz` / `.nrrd`） | `docs/domains/images.md` 未实施项；科研/医疗影像高度敏感不愿上传，需三视图切片与窗宽窗位，替代 3D Slicer 等大型桌面软件
- [ ] 高 | 实现 ZIP 归档内文件按需点击预览（跨插件复用） | 在 `archive-metadata-viewer` 中点击未加密 ZIP 内图片/PDF/代码/表格时按需流式解压并复用对应查看器，涉及工作区协议与跨插件协作
- [ ] 中 | 抽取 dji-osmo / gopro-max / insta360 的双轨播放与全景渲染到共享包 | DJI 与 GoPro playback 约 375 行仅 64 行不同；需人工浏览器验收三种相机样例
- [ ] 中 | 合并 `docs/videos` 文档为当前状态（删除阶段证据与已完成计划，保留有效规则） | 按 AGENTS.md 文档规则
- [ ] 中 | 合并 `docs/3d`、`docs/images`、`docs/ebooks`、`docs/audio` 文档为当前状态 | 同上，可拆成每目录一条
