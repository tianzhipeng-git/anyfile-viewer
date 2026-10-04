# 小型 sitemap 抓取实验

## 目的与范围

保留 `/sitemap.xml` 作为对照，新增 `/sitemap-core.xml`，检查 Google 能否获取并处理一份小型静态 sitemap。

实验文件是 `public/sitemap-core.xml`，包含 20 个生产环境规范 URL：中英文首页、文档与 CAD 分类，以及 PDF、DOCX、XLSX、PPTX、HEIC、DWG、ZIP 格式页。文件固定使用生产域名，不随预览部署域名变化；页面移动或删除时需同步维护这份清单。

只保留标准 `urlset/url/loc`，不添加虚构的 `lastmod`。原 sitemap 和 robots.txt 不变。通过 GSC 单独提交实验地址，便于观察独立记录。

这是一项最小可读性诊断，同时改变了 URL、体积、生成方式和 alternate 标记；成功不能单独证明原 sitemap 是体积或 hreflang 导致的故障。

## 排查基线（2026-09-29，北京时间）

- 原 sitemap 返回 HTTP 200，XML 可解析，148,002 字节、410 个不重复 URL。
- GSC API：`isPending: true`，`errors: 0`，无 `lastDownloaded`；最近提交时间为 2026-09-28 18:40。
- Google 实际网址测试于 2026-09-29 02:32 成功抓取原 sitemap，允许抓取。实际测试成功不等于 sitemap 已处理。
- 网页索引报告更新至 2026-09-21：73 页已收录、5 页未收录。
- 英文首页、英文 PDF 已收录；中文 PDF、英文 HEIC、英文 DWG 的 URL Inspection 状态为 Google 尚不知道此 URL。

## 发布与观察

1. 部署后检查 `https://www.anyfile.top/sitemap-core.xml`：直接返回 200、XML 内容类型、20 个 URL；文件中所有页面应返回 200 且 canonical 与清单一致。
2. 在 `sc-domain:anyfile.top` 的 GSC 站点地图报告中单独提交该地址一次，记录实际提交时间。不要在网址检查中请求将 XML 本身编入索引。
3. 提交后约 24 小时、72 小时和 7 天分别记录两份 sitemap 的状态、上次读取时间、发现 URL 数；使用 API 时记录 `isPending`、`lastDownloaded`、`errors` 和 `contents[].submitted`。这些是观察时间点，不是 Google 的处理时限承诺。
4. 小型 sitemap 的成功标准为成功读取并发现 20 个 URL；核心页面是否新增收录另行观察。不要使用已弃用的 `contents[].indexed` 判断收录数。
5. 若小型成功、原文件仍失败，后续每次仅改变一个因素进一步定位；若两者都待处理或失败，结合真实 Googlebot 请求日志检查抓取与处理链路。仅凭 GSC 提示不能认定 XML 有错。

## 首次回访（2026-09-29 12:25 左右，北京时间）

- 实验文件已上线：HTTP 200、`application/xml`、1,424 字节，XML 可解析，20 个 URL。具体部署完成时间未核实。
- GSC API 记录实验文件提交时间为 2026-09-29 03:36:16；用户观察到提交后立即显示“无法抓取”。
- 两份 sitemap 的 UI 均显示类型未知、无法抓取、发现 0 页；API 均为 `isPending: true`、`errors: 0`，没有 `lastDownloaded`。
- 实验文件的 URL Inspection 历史记录显示：2026-09-29 03:37:58，Googlebot 智能手机版抓取成功，允许抓取；状态为“已抓取 - 尚未编入索引”。这证明至少一次普通网页抓取成功，不等于 sitemap 处理成功；XML 本身无需网页收录。
- 抓取统计更新至 2026-09-27：4,264 次请求，99% 返回 200，平均响应时间 70 毫秒；www 与裸域主机均显示“没有问题”。该报告早于此次实验，仅作为背景。
- 人工处置报告显示“未检测到任何问题”。

目前未定位根因。实验未改善 sitemap 处理状态，但实际 Googlebot 成功获取文件，降低了文件体积、alternate 标记或持续性访问故障作为唯一原因的可能性。下一步应观察处理状态并核对 sitemap 请求日志，避免继续盲目改写 XML 或反复提交。
