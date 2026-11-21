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
- [ ] 中 | 新增邮件查看器（`.eml` / `.msg`） | 解析 RFC 5322 MIME 与 Outlook CFBF `.msg`，展示安全清理正文与附件清单；无 Outlook 打开 `.msg` 搜索痛点极强，邮件高度隐私敏感不愿上传
- [ ] 中 | `archive-metadata-viewer` 补齐 `.7z` 归档目录查看 | 复用或抽取 `comic-book` 已有的 `comic-archive` libarchive WASM，无需新构建；macOS 与浏览器原生打不开 `.7z`，搜索需求高
- [ ] 中 | 新增网络抓包查看器（`.pcap` / `.pcapng`） | 解析包头与常见 TCP/UDP/DNS/HTTP 摘要、筛选与载荷检查；排查问题常需安装 Wireshark，流量数据极度敏感不愿上传
- [ ] 中 | 新增地理轨迹与矢量数据查看器（`.geojson` / `.gpx` / `.kml` / `.shp`） | 纯本地 2D 坐标投影与属性表展示（不请求在线地图瓦片）；替代 QGIS / Google Earth，符合 `选格式.md` 地理数据免上传场景
- [ ] 低 | 为缺少真实样例的插件补 `examples/`，逐个移出 check-repo 的 PLUGINS_WITHOUT_SAMPLES | 先做 code、sqlite、hex、dev-wasm 等易获得样例的
- [ ] 低 | 为 `ffmpeg-video` / `ffmpeg-audio` 补齐站点插件页与格式页，并移出 `scripts/check-repo.mjs` 的 UNPUBLISHED_PLUGINS | 两个回退插件当前仅注册未发布站点页面，补齐后完善插件目录与格式覆盖统计
- [ ] 高 | 新增 GPU 纹理查看器（`.dds` / `.ktx` / `.ktx2`） | `docs/images/roadmap.md` 阶段 4 未实施项；游戏与 3D 资产开发高频痛点，需引入 Khronos/Basis WASM 转码并支持 mipmap、cubemap 与通道检查
- [ ] 高 | 新增医学/科学体数据查看器（`.nii` / `.nii.gz` / `.nrrd`） | `docs/images/roadmap.md` 阶段 5 未实施项；科研/医疗影像高度敏感不愿上传，需三视图切片与窗宽窗位，替代 3D Slicer 等大型桌面软件
- [ ] 中 | 扩展 `@anyfile/viewer-ui` 为共享 Inspector UI Kit 与主题变量契约 | 37/52 插件手写 `<style>` 与重复壳层/键值表/筛选栏且暗色模式易失配；补齐 `--viewer-muted`/`--viewer-surface` 等 token 及轻量可组合原语（shell、KV 列表、数据表、`el()`、`formatBytes()`），新插件优先采用
- [ ] 中 | 拆分插件策略配置与接线元数据（`viewer/plugin-policies.json`、`src/lib/viewer-protocol.test.ts`） | 52 个插件已使 `plugin-policies.json` 达 840 行（逼近 1000 行门禁上限）、`viewer-protocol.test.ts` 达 598 行，且并行新增插件易在 6–7 个中心文件冲突；按插件拆分策略并分离协议契约与路由测试
- [ ] 低 | 在 `@anyfile/runtime-assets` 中抽取共享 Worker RPC 客户端 | 20+ Worker+WASM 插件重复编写请求 ID 关联、超时、`AbortSignal` 终止、transferable 与运行时回退逻辑（如 `djvu/src/worker-client.ts` 近 200 行）；抽为轻量类型化 `createWorkerRpcClient` 减少泄漏与取消竞态
- [ ] 高 | 抽取共享分页文档视口适配器（`PagedDocumentSource`） | `djvu` 与 `pdf` 各自实现 ~500–1000 行分页画布工具栏、缩放/适应、画布淘汰与大纲侧栏；抽到共享包（先从 `djvu` 抽起，再视情况迁 `pdf`）以复用至后续分页格式（TIFF/XPS/PostScript 等）
- [ ] 中 | 抽取 dji-osmo / gopro-max / insta360 的双轨播放与全景渲染到共享包 | DJI 与 GoPro playback 约 375 行仅 64 行不同；需人工浏览器验收三种相机样例
- [ ] 中 | 合并 `docs/videos` 文档为当前状态（删除阶段证据与已完成计划，保留有效规则） | 按 AGENTS.md 文档规则
- [ ] 中 | 合并 `docs/3d`、`docs/images`、`docs/ebooks`、`docs/audio` 文档为当前状态 | 同上，可拆成每目录一条
