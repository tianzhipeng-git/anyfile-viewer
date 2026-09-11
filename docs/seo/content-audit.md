# 内容相似度审计

运行 `pnpm audit:content`，读取已有生产构建 `.next/server/app` 的 sitemap 与 HTML，输出 `docs/tasks/seo-content-audit/latest/report.md` 和 `audit.json`（报告目录已被 Git 忽略，重新构建不会清除）。要检查最新代码，先完成 `pnpm build`；脚本不会自动构建，也不抓取线上网站。报告会记录 sitemap 和每份 HTML 的修改时间。构建目录属于 Next.js 内部产物，升级后若布局变化需调整读取器。

```sh
pnpm test:seo-audit
pnpm audit:content
# 可保留多次快照；输出目录不要放进 public
pnpm audit:content --input .next/server/app --output docs/tasks/seo-content-audit/before
```

范围是 sitemap 中中英文的 formats、categories、plugins、viewers 页面，不包括首页、工具入口和隐私等说明页，也不扫描 sitemap 外的别名页。任何 HTML 读取失败会写入报告并以非零状态退出，避免把不完整扫描当作成功。

## 指标及解释

- 从 HTML 的 main 遍历文本，按块级元素分段，包含 div/span 包裹的摘要和卡片；去除脚本、导航和显式隐藏内容。保留 `data-nosnippet`：它不是禁止索引标记。不执行 CSS 或 JavaScript，因此不是浏览器可见文本的完整复刻。
- 在同语言页面间比较连续 5 token 的集合，使用 Jaccard（交集 / 并集）。英文按词，中文按汉字；不得将两个语言的分数直接当成质量高低比较。
- 同语言至少 `max(3, ceil(页面数 × 10%))` 页重复的完整段落视为公共段落；“核心”指标去除这些段落。它只能识别完全重复的公共文本，家族内的共享说明仍可能保留。公共占比按 token 数计算。
- 同时给出包含率（交集 / 较小集合），发现较短页面被另一页覆盖的情况。空集合记零，不能解释为内容独特。
- 报告候选条件：正文 Jaccard ≥ 0.5，或核心 Jaccard ≥ 0.35，或核心包含率 ≥ 0.8 且较小核心集合至少 30 个 shingle。这些是排查启发式，不是 Google/Bing 阈值，不作为 CI 质量红线。
- JSON 保存每页最近邻、正文块、重复元数据组，以及候选对的共享段落和双方不同段落样例。Markdown 只展示排名靠前的样本。没有语义相似度模型，换词可以降低分数，但不会自动创造用户价值。

静态检查包括 title/description 缺失与同语言重复、H1 数量、canonical 数量与是否自指、meta noindex。通过这些检查不代表可索引：线上状态码、HTTP robots 头、robots.txt、爬虫访问限制、搜索引擎选定 canonical 和索引状态需另行核验。

## 2026-09-11 初版脚本结果（历史记录）

输入为 2026-09-09 的本地构建快照：406 个内容页全部读取成功，210 个候选页面对，重复 title/description 组为 0，静态标记检查问题为 0。候选对不是问题页面数，也不是被处罚数量。

| 中文格式页面组 | 核心 Jaccard 样例 | 当前源码定位 |
| --- | --- | --- |
| CBR / CB7 / CBT | 92.3% | `src/content/formats/ebook-archives.ts` |
| PCD / XYZ / LAS | 87.9% | `src/content/formats/point-cloud.ts` |
| MOBI / AZW / AZW3 / PRC / PDB | 87.9% | `src/content/formats/ebook-archives.ts` |
| STEP / STP / IGES / IGS / BREP | 80.7% | `src/content/formats/cad-exchange.ts` |

该次扫描时，这些模块使用 `.map()` 共享内容，部分标题、介绍和 FAQ 仅插入不同扩展名。建议先人工审查这些组：

1. 等价扩展名核实后按既有内容规范合并；不同规范或用户任务保留独立页面，不能只因共用渲染器就合并。
2. 给独立页面补充该格式自身的容器/结构、用途、可打开范围、失败原因及与邻近格式的差异。事实需结合协议、实现与样例核实，不能用改同义词或堆字数替代。
3. 将 GSC/Bing 导出的未索引原因按 URL 对照候选列表。优先区分未抓取、已抓取未索引、重复/其他 canonical，以及技术阻断；相似度不构成因果证明。
4. 修改前后使用同一脚本及同一范围比较，再追踪真实索引结果；页面库存变化会影响公共段落判定，因此核心分数的变化不一定全来自文案变化。

## 官方依据

- [Google 请求重新抓取](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)：抓取可能需要几天到几周；提交不保证索引。一周未收录不能单独证明被降权。
- [Google canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization)：重复内容会涉及代表 URL 的选择，正常的重复内容不等于违反垃圾内容政策。
- [Google 索引报告](https://support.google.com/webmasters/answer/7440203?hl=en)：结合具体排除原因和 URL 检查判断问题阶段。
- [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a)：重复内容、低价值 URL 和抓取浪费可能影响索引；这不是公开可复刻的评分算法。

本工具不修改内容、canonical、noindex 或重定向；优化应依据真实用途及检查结果作出编辑决策。

## 本轮内容优化及核对依据

初版提取遗漏了 div 包裹的插件摘要；本轮已修正，修改前和修改后的报告都应使用修正后的提取器，不能直接与历史分数比较。完整对比保存在 `docs/tasks/seo-content-audit/`。

两次 2026-09-11 本地生产构建的对比：内容页 406 → 400，宽松候选对 201 → 87，核心 Jaccard ≥50% 的页面对 114 → 0。最高残留核心相似度为 42.3%，不是搜索引擎处罚阈值；剩余候选主要是共享许可说明、归档查看限制与已有格式差异的 PSD/PSB。修改后的 22 个格式实体组内，中文最高核心相似度为 7.4%–12.4%。库存变化也会影响公共段落阈值，不能将全部分数变化都归因于文案。

完整测试、lint、生产构建与 bundle 检查通过。六条中英文别名 URL 已在本地生产服务器验证为 HTTP 308，目标页为 200，canonical/hreflang 与 sitemap 均指向主页面。当前仅完成本地修改，未部署，也没有据此宣称收录改善。

- `.stp` 合并到 `.step`，`.igs` 合并到 `.iges`，电子书 `.prc` 合并到 `.mobi`。复用现有 aliases 与永久重定向流程，删除的是独立内容实体，旧 URL 和文件识别仍保留。导航、sitemap 和插件反向链接由主实体列表生成。
- CAD、点云、3D 网格和电子书/漫画共 22 个保留格式实体的中英文内容改为独立文案。共享的真实约束仍保留，差异来自具体文件结构、使用任务与失败原因。
- 不因插件页简短、支持等级较低或暂未收录就新增 noindex。插件页承担实现透明度职责，且初版相似度受漏读摘要影响。对于已合并的入口，重定向比 noindex 更符合目的；Google 也不建议用 noindex 选择站内重复内容的代表页。
- 未改变运行时能力、支持等级、依赖和资源预算，也未将 pending 验证状态改为 verified。文案说明当前代码可确认的范围，不代表新增格式能力已经过浏览器样例验收。

格式事实参考（产品实际支持范围以本地读取器为准）：

- [Open CASCADE BREP 读取配置](https://dev.opencascade.org/doc/refman/html/class_d_e_b_r_e_p___configuration_node.html)；本地 `viewer/plugins/cad-exchange/src/probe.ts`、`adapter.ts`、`convert.ts`。
- [Autodesk IGES 导入说明](https://help.autodesk.com/cloudhelp/2025/ENU/MoldflowInsight-CLC-NewUser/files/Import-and-Export/Supported-model-import-formats/MoldflowInsight_CLC_NewUser_Import_and_Export_Supported_model_import_formats_Import_IGES_model_files_html.html) 明确 `.igs` / `.iges` 写法；STEP/STP 同时由本地同一签名读取路径处理。
- [PCL 文件 IO](https://pointclouds.org/documentation/group__io.html)、[OGC 点云格式报告](https://docs.ogc.org/per/18-048r1.html)；本地 `viewer/plugins/point-cloud/src/points.worker.ts`、`las.ts`、`laz.ts` 核对 ASCII 字段、坐标还原和读取预算。
- [libmobi 支持格式](https://github.com/bfabiszewski/libmobi) 将 PRC/MOBI 列为 Mobipocket 文件；本地 `viewer/plugins/mobi/src/probe.ts`、`publication.ts` 和 `decoder.worker.ts` 核对数据库签名、保护状态和阅读结构。合并页明确不支持 PRC 应用程序。
- 本地 `viewer/plugins/comic-book/src/tar-source.ts`、`archive-source.ts` 和 `archive-client.ts` 区分 TAR 分段读取与 RAR/7z 展开，纠正 CBT 原先套用的固实归档 FAQ。
- [3MF 规范](https://3mf.io/spec/)、[glTF 2.0 规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)；本地 `viewer/plugins/print-3d/src/` 与 `viewer/plugins/mesh-3d/src/` 核对本地关联资源、基础材料、几何与不支持的压缩扩展。
- [Google 合并重复 URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) 说明重定向、canonical 及 noindex 的区别。
