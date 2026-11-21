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

- [x] 低 | EPUB 阅读器补站点插件页（`src/content/plugins.ts`、`src/content/manifests.ts`），并移出 `scripts/check-repo.mjs` 的 UNPUBLISHED_PLUGINS | 格式页已标等级 4 但未列出阅读器，统计也缺插件 id；2026-11-19 e2892df
- [x] 低 | `ffmpeg-video` 补齐 `.wmv` / `.asf` 与 `.mpg` / `.mpeg` / `.vob` 播放支持 | 复用已有 `@anyfile/ffmpeg-playback` 运行时；`docs/videos/roadmap.md` 阶段 3 待补有界 probe 与主轨验证，macOS 与浏览器原生打不开；2026-11-19 2a7c344
- [x] 低 | `ffmpeg-audio` 补齐 `.wma`（ASF 音频）播放支持 | 复用已有 `@anyfile/ffmpeg-playback` 运行时；`docs/audio/roadmap.md` 阶段 3 待补独立 probe 与验证，浏览器与 macOS 原生不支持；2026-11-21 f3c3729
- [ ] 中 | 新增邮件查看器（`.eml` / `.msg`） | 解析 RFC 5322 MIME 与 Outlook CFBF `.msg`，展示安全清理正文与附件清单；无 Outlook 打开 `.msg` 搜索痛点极强，邮件高度隐私敏感不愿上传
- [ ] 中 | `archive-metadata-viewer` 补齐 `.7z` 归档目录查看 | 复用或抽取 `comic-book` 已有的 `comic-archive` libarchive WASM，无需新构建；macOS 与浏览器原生打不开 `.7z`，搜索需求高
- [x] 高 | 新增旧版 Office 二进制文档查看器（`.doc` / `.ppt` / `.rtf`） | `docs/tasks/选格式.md` 明确列为差异化主战场；需 CFBF 二进制解析或轻量 WASM 方案，解决无桌面 Office 无法打开遗留文档的高频痛点；2026-11-20 9db3c6d
- [x] 低 | 新增字体查看器（`.ttf` / `.otf` / `.woff` / `.woff2`） | 用原生 `FontFace` 与轻量表头解析展示字形瀑布流、试打预览与元数据；搜索需求高，无需安装到系统即可本地查看；2026-11-21 3b51885
- [x] 高 | 新增 CHM 帮助文档查看器（`.chm`） | `docs/ebooks/roadmap.md` 阶段 7 未实施项；macOS/Linux 原生打不开，技术手册与旧资料搜索需求强，需 ITSF/LZX 解码与安全沙箱隔离；2026-11-20 be9c488
- [ ] 中 | 新增网络抓包查看器（`.pcap` / `.pcapng`） | 解析包头与常见 TCP/UDP/DNS/HTTP 摘要、筛选与载荷检查；排查问题常需安装 Wireshark，流量数据极度敏感不愿上传
- [ ] 中 | 新增地理轨迹与矢量数据查看器（`.geojson` / `.gpx` / `.kml` / `.shp`） | 纯本地 2D 坐标投影与属性表展示（不请求在线地图瓦片）；替代 QGIS / Google Earth，符合 `选格式.md` 地理数据免上传场景
- [ ] 低 | 新增 X.509 证书查看器（`.pem` / `.crt` / `.cer` / `.der`） | 纯 TS ASN.1 解析，展示颁发者、有效期、SAN、指纹与证书链；运维/开发者刚需且极度隐私敏感，不愿上传在线解码站
- [ ] 低 | 新增日历与联系人查看器（`.ics` / `.vcf`） | 纯 TS 解析 iCalendar 日程与 vCard 联系人卡片；常见邮件附件，直接双击会被系统静默导入且含个人隐私
- [x] 高 | 新增 DjVu 电子书查看器（`.djvu` / `.djv`） | `docs/ebooks/roadmap.md` 阶段 6 未实施项；学术论文与扫描古籍常见格式，需安装 WinDjView 等桌面软件，需评估/自建 Worker WASM 与许可证合规；2026-11-21 e6adce8
- [x] 高 | 新增原生二进制结构查看器（`.elf` / `.so` / `.dll` / `.exe` / `.dylib` / `.a`，`dev-native-binary-viewer`） | `docs/developer/more-dev.md` 阶段 5 未实施项；跨 C/C++/Go/Rust/Node 多生态，覆盖 ELF、PE/COFF、Mach-O 与 Unix archive 的有界结构检查；2026-11-21 c8427d2
- [ ] 低 | 为缺少真实样例的插件补 `examples/`，逐个移出 check-repo 的 PLUGINS_WITHOUT_SAMPLES | 先做 code、sqlite、hex、dev-wasm 等易获得样例的
- [ ] 高 | 新增 GPU 纹理查看器（`.dds` / `.ktx` / `.ktx2`） | `docs/images/roadmap.md` 阶段 4 未实施项；游戏与 3D 资产开发高频痛点，需引入 Khronos/Basis WASM 转码并支持 mipmap、cubemap 与通道检查
- [ ] 高 | 新增医学/科学体数据查看器（`.nii` / `.nii.gz` / `.nrrd`） | `docs/images/roadmap.md` 阶段 5 未实施项；科研/医疗影像高度敏感不愿上传，需三视图切片与窗宽窗位，替代 3D Slicer 等大型桌面软件
- [ ] 中 | 抽取 dji-osmo / gopro-max / insta360 的双轨播放与全景渲染到共享包 | DJI 与 GoPro playback 约 375 行仅 64 行不同；需人工浏览器验收三种相机样例
- [ ] 中 | 合并 `docs/videos` 文档为当前状态（删除阶段证据与已完成计划，保留有效规则） | 按 AGENTS.md 文档规则
- [ ] 中 | 合并 `docs/3d`、`docs/images`、`docs/ebooks`、`docs/audio` 文档为当前状态 | 同上，可拆成每目录一条
