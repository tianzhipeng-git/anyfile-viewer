# Anyfile 格式、类别与插件页面规范

本规范定义 `/{locale}/formats/{extension}`、`/{locale}/categories/{slug}`、`/{locale}/plugins/{pluginId}` 三类静态内容页的职责、事实源边界、发布门禁与相似度审计方法。多语言规范见 [i18n.md](i18n.md)，隔离与部署见[加载部署约定](../viewer-loading-and-deployment.md)。

## 1. 页面架构与职责

三类页面共用各自的动态路由模板（`src/app/[locale]/{formats,categories,plugins}/.../page.tsx`），构建期通过 `generateStaticParams()` 为全部 `published` 实体生成静态 HTML（普通 `next build` SSG，不改 `output: "export"` 以保留 `next.config.ts` 响应头）。内容数据位于 `src/content/`。

| 页面类型 | 职责与意图 | 关键要求 |
|---|---|---|
| 格式页 `/formats/{ext}` | 主搜索落地页（如 `{ext} viewer online`） | 必须映射真实已注册插件（不能仅靠 hex 兜底）；等价扩展名（如 `.jpeg`→`.jpg`、`.stp`→`.step`、`.igs`→`.iges`、`.prc`→`.mobi`）通过 `aliases` 永久重定向至主 URL 且不入 sitemap；正文须覆盖用途、实际能力、支持等级说明、限制/环境条件、本地处理说明、打开入口、相关链接与格式专属 FAQ |
| 类别页 `/categories/{slug}` | 聚合与内链枢纽 | 说明类别场景、代表格式对比、原生与专用插件差异、常见打不开原因与类别 FAQ；不宣称整类完整支持 |
| 插件页 `/plugins/{pluginId}` | 技术透明度与开源致谢 | 聚焦“Anyfile 如何打开此类文件”，不与格式页争夺 `viewer online` 意图；列出真实进入运行时的上游开源项目、版本、许可证与对应格式反向链接 |

## 2. 单一事实源与首包隔离

- **三层分离**：插件 Manifest（运行时格式/扩展名权威来源）≠ 结构化支持资料（公开等级范围、限制、验证状态）≠ SEO 编辑文案（标题、介绍、FAQ、替代软件）。
- **禁止漂移**：底层依赖理论支持但产品未实现识别与打开路径的格式不得发布；`typicalLevel` 仅是公开摘要，不参与运行时 `probe()` 路由。
- **替代软件策略**：等级 1–2 突出推荐；等级 3 仅在缺失能力对目标用户重要时推荐；等级 4–5 仅在需要编辑等非查看能力时说明。不得暗示合作关系。
- **首包隔离**：长文案、FAQ、上游致谢保存在服务端内容模块，严禁写入插件 Manifest 或被 `src/lib/viewer-registrations.ts` 带入 `/view` 首包；内容页亦不得静态导入插件根入口、probe、Worker 或 WASM。

## 3. 路由、SEO 与发布门禁

- 仅对 `PUBLISHED_LOCALES` 生成静态参数；未发布语言或非法实体返回 404，禁止英语回退正文。
- 每个可索引页须具备唯一本地化 `<title>` / description、自引用 canonical、`hreflang`（含 `x-default` 指向英文）、breadcrumb、与可见内容一致的 JSON-LD（`BreadcrumbList` / `FAQPage` / 站点级 `WebApplication`）。
- 普通介绍页不加 COOP/COEP；进入/离开 `/view` 通过 `IsolationBoundaryLink` 完整导航跨越隔离边界。
- 自动化测试校验：每个 published 格式映射真实非 hex 插件且主扩展名与 Manifest 一致；alias 无冲突、308 重定向且不进 sitemap；分类与插件双向引用完整；同 locale 下 title/description/URL 唯一；SEO 内容不带入运行时代码。

## 4. 内容质量与相似度审计

- **反模板套壳与低质页**：同插件拆出多个格式页时，须写清各格式的真实差异、典型来源软件/使用场景、具体限制与排错说明，禁止仅替换扩展名或同义词改写；等价扩展名一律走 `aliases` 308 重定向，不得拆成重复落地页。
- **文案与 FAQ 质量**：FAQ 须回答真实用户痛点（打不开原因、版本/编码限制、格式差异、本地隐私处理），禁止注水凑字数、关键词堆砌或复读首段；`en` 与 `zh-CN` 均须自然准确，无生硬机翻味或英文回退残留。

运行 `pnpm audit:content` 扫描已有生产构建（`.next/server/app`）中 sitemap 覆盖的 formats/categories/plugins/viewers 页面，输出至 `docs/tasks/seo-content-audit/latest/{report.md,audit.json}`（Git 忽略）：

```bash
pnpm test:seo-audit
pnpm audit:content
# 可保存基线快照（不要输出到 public/）
pnpm audit:content --input .next/server/app --output docs/tasks/seo-content-audit/before
```

- 按同语言连续 5-token shingle 计算正文与去除公共段落（出现于 ≥ `max(3, ceil(页数×10%))` 页）后的核心 Jaccard 及包含率。
- 启发式候选阈值：正文 Jaccard ≥ 0.5、核心 Jaccard ≥ 0.35，或核心包含率 ≥ 0.8 且较小集合 ≥ 30 shingle（仅作人工排查线索，非 CI 红线或搜索引擎处罚阈值）。
- 同时静态检查 title/description 缺失与重复、H1 数量、canonical 自指与 meta noindex。
