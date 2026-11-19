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

- [ ] 低 | EPUB 阅读器补站点插件页（`src/content/plugins.ts`、`src/content/manifests.ts`），并移出 `scripts/check-repo.mjs` 的 UNPUBLISHED_PLUGINS | 格式页已标等级 4 但未列出阅读器，统计也缺插件 id
- [ ] 低 | 为缺少真实样例的插件补 `examples/`，逐个移出 check-repo 的 PLUGINS_WITHOUT_SAMPLES | 先做 code、sqlite、hex、dev-wasm 等易获得样例的
- [ ] 中 | 抽取 dji-osmo / gopro-max / insta360 的双轨播放与全景渲染到共享包 | DJI 与 GoPro playback 约 375 行仅 64 行不同；需人工浏览器验收三种相机样例
- [ ] 中 | 合并 `docs/videos` 文档为当前状态（删除阶段证据与已完成计划，保留有效规则） | 按 AGENTS.md 文档规则
- [ ] 中 | 合并 `docs/3d`、`docs/images`、`docs/ebooks`、`docs/audio` 文档为当前状态 | 同上，可拆成每目录一条
