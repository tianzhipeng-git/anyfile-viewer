# 文件格式需求研究报告

方法论版本：1.1
市场：地区代码 `2840`，语言 `en`
生成时间：`2026-10-03T16:01:31.125314+00:00`
配置 SHA-256：`9a1db6a89db2b363bd4a85af721adf7f67c22578f50f2a763ba35dee2caf0ac8`
DataForSEO 报告成本：`0.2752` 美元

本报告衡量搜索需求与搜索机会，不代表技术实现可行性。

## 本轮决策建议

本轮于北京时间 2026-10-04 完成，目录保留启动时的 2026-10-03 日期。用户授权选定 10 个候选并运行；市场为美国／英语，方法论 v1.1。31 次付费请求全部成功，未重试，响应级费用合计 0.27524 美元。

**建议下一步优先做 MPP、Visio（VSDX / VSD）的技术可行性评估；SKP 保持第二梯队。** 这是结合本站“接收文件后临时查看、免安装、本地处理”的定位形成的产品判断，不是重新计算的算法排名，也不代表已验证解析或渲染可行性。DICOM 保留为独立专项；图片方向继续评估 DDS、JP2、EXR。

- **MPP：69.2 分，有效月搜索量 1440。** `how to open mpp file` 月搜索量 720，`mpp viewer online` 为 140；需求不只有格式介绍。24 个查看相关查询达到月搜索量 10，但大量相近变体重复出现 720，不能累加成独立需求。近期代表词趋势约 -57%，不能描述为增长机会。首个可用目标应评估任务层级、日期及基础甘特图，不做项目编辑器。
- **VSDX：63.0 分，640；VSD：62.6 分，420。** VSD 代表查询 `how to open vsd file without visio` 为 210；VSDX 的 `how to open vsdx file without visio` 为 70，`open vsdx file online` 为 40。这些查询直接支持免安装查看场景。两种格式独立评分，但用户和查询需求可能重叠，不能把 640 + 420 当作独立市场规模。建议作为一条产品方向评估，分别验证文件版本与渲染路径，不假定同一个解析器能覆盖二者。
- **SKP：65.2 分，1740，为本轮有效搜索量最高。** 代表词 `sketchup file viewer` 为 1600，`skp viewer online` 为 210。需求规模值得保留；机器检测到 7 个查看器相关域名，技术方案、授权、浏览器内解析和版本覆盖仍待评估。
- **DICOM：73.0 分，1435，原始排名第一。** `dicom viewer online` 为 720，但代表词是 `dicom file viewer mac`（1000）。评分不能证明通用单张图片预览足够满足需求，建议单独评估序列和基本显示控制的最小范围。
- **EXR：68.2 分，627.5。** 主要由 `open exr file`（590）支撑；`exr viewer online` 只有 10。本轮机器未检测到直接查看器域名，给了 15 分竞争空白分，这不是没有竞品的证明；另外名称中 open 带来的意图污染仍存在，不据此将 EXR 排为实际开发第三名。
- **DDS：62.7 分，520；JP2：62.8 分，262.5。** 两者差 0.1 分没有决策意义。DDS 的 `dds viewer online` 为 70、`dds file viewer` 为 260；适合和 JP2 一起按最低有用展示范围与实现成本选取。
- **IFC：60.2 分，445；CDR：59.7 分，452.5。** 仍值得保留，但本轮需求证据不足以让 IFC 优先于 MPP、Visio 和 SKP。IFC 已有浏览器技术路线的线索不等于 SEO 优先级更高，本轮未做技术可行性验证。

## 证据限制

1. 分数是筛选线索，不是用户数、预计流量或开发收益。有效月搜索量为最大查看词加封顶次要词贡献，禁止直接求和原始关键词搜索量。市场仅限美国／英语。
2. 直接查看器域名由文本规则识别，结果包含应用商店、论坛和教程站。例如 VSD 列表含 reddit.com / lifewire.com，DDS 列表含论坛与 YouTube。不能把这个指标当成经过核验的产品数量。本轮未做人工 SERP 评审。
3. DICOM 的机器检测域名数由前轮 9 降至本轮 2，EXR 由 5 降至 0，显著抬高机会分；这可能受搜索结果快照和文本规则影响，不能解释成竞争突然减少或需求快速增长。
4. 7/10 个候选缺少可计算趋势；无数据不代表没有需求或下跌。MPP 约 -57%、DDS 约 -9%、IFC -100% 是各自代表查询最近一季与前一季的归一化序列比较，不是整个格式的搜索量同比变化。低量序列可能稀疏，IFC -100% 不意味着 IFC 需求消失。
5. EXR 中 `what is open exr file` 和 `open exr file format` 各 10 被判为查看词，存在语义污染。保持原始算法、分数和证据不变，用限制说明处理，未擅自重跑。
6. 关键词覆盖率 100% 表示所请求的词返回了记录，不表示覆盖整个市场，也不保证每个指标都非空。SKP 99%、IFC 95% 的意图纯度仅适用于本轮选中词，不能外推成全市场比例。
7. 9 月设计/CAD 研究用 v1.0，不与本轮分数作增长比较。图片前轮虽同为 v1.1，关键词池、快照、趋势窗口也可能变化。原始需求排名保持如下，产品建议与之分开。

## 可复现材料

- [范围与支持核对](scope.md)、[候选配置](candidates.json)、[dry-run 计划](dry-run-plan.json)
- [机器报告](report.json)、[标准化证据](evidence.json)、[原始响应与请求检查点](checkpoint.json)
- 请求数：Keyword Suggestions 10、Keyword Overview 1、SERP Advanced 10、Trends Explore 10。

## 原始评分排名

| 排名 | 格式 | 得分 | 有效月搜索量 | 查看意图纯度 | 覆盖率 | 直接查看器域名数 | 趋势 | 证据置信度 | 建议 | 标记 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | DICOM Image (dcm) | 73.0 | 1435.0 | 42% | 100% | 2 | 无数据 | 7.0/10 | 强需求候选 | 趋势证据缺失 |
| 2 | Microsoft Project Plan (mpp) | 69.2 | 1440.0 | 43% | 100% | 5 | -57% | 10.0/10 | 值得开展技术可行性研究 | — |
| 3 | OpenEXR Image (exr) | 68.2 | 627.5 | 25% | 100% | 0 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 4 | SketchUp Model (skp) | 65.2 | 1740.0 | 99% | 100% | 7 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 5 | Microsoft Visio XML Drawing (vsdx) | 63.0 | 640.0 | 45% | 100% | 3 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 6 | JPEG 2000 JP2 Image (jp2) | 62.8 | 262.5 | 15% | 100% | 3 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 7 | DirectDraw Surface (dds) | 62.7 | 520.0 | 22% | 100% | 7 | -9% | 10.0/10 | 值得开展技术可行性研究 | — |
| 8 | Microsoft Visio Binary Drawing (vsd) | 62.6 | 420.0 | 50% | 100% | 3 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 9 | Industry Foundation Classes (ifc) | 60.2 | 445.0 | 95% | 100% | 9 | -100% | 10.0/10 | 值得开展技术可行性研究 | — |
| 10 | CorelDRAW Drawing (cdr) | 59.7 | 452.5 | 38% | 100% | 6 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |

## 证据明细

### DICOM Image

- 代表查询：`dicom file viewer mac`
- 主要关键词月搜索量：`1000.0`
- 月搜索量≥10的有效查询数：`11`
- SERP 相关性：`100%`
- 直接查看器域名：`apps.apple.com, sourceforge.net`
- 关键词难度：`17`
- 评分组成：`有效搜索量=32.8, 查询广度=10, 查看意图纯度=2.08, 查看器竞争空白=12, 关键词难度机会=4.15, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### Microsoft Project Plan

- 代表查询：`how to open mpp file`
- 主要关键词月搜索量：`720.0`
- 月搜索量≥10的有效查询数：`24`
- SERP 相关性：`75%`
- 直接查看器域名：`apps.apple.com, ganttpro.com, online.projectplan365.com, products.groupdocs.app, projectviewercentral.com`
- 关键词难度：`10`
- 评分组成：`有效搜索量=32.8, 查询广度=10, 查看意图纯度=2.16, 查看器竞争空白=6, 关键词难度机会=4.5, SERP相关性=3.75, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=3`

### OpenEXR Image

- 代表查询：`open exr file`
- 主要关键词月搜索量：`590.0`
- 月搜索量≥10的有效查询数：`12`
- SERP 相关性：`100%`
- 直接查看器域名：`无`
- 关键词难度：`22`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=1.27, 查看器竞争空白=15, 关键词难度机会=3.9, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### SketchUp Model

- 代表查询：`sketchup file viewer`
- 主要关键词月搜索量：`1600.0`
- 月搜索量≥10的有效查询数：`7`
- SERP 相关性：`100%`
- 直接查看器域名：`help.sketchup.com, imagetostl.com, innerscene.com, play.google.com, reddit.com, sketchup-viewer.en.softonic.com, skpviewer.com`
- 关键词难度：`11`
- 评分组成：`有效搜索量=32.8, 查询广度=8, 查看意图纯度=4.95, 查看器竞争空白=3, 关键词难度机会=4.45, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### Microsoft Visio XML Drawing

- 代表查询：`how to open vsdx file`
- 主要关键词月搜索量：`320.0`
- 月搜索量≥10的有效查询数：`28`
- SERP 相关性：`75%`
- 直接查看器域名：`imagetostl.com, play.google.com, products.groupdocs.app`
- 关键词难度：`0`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=2.24, 查看器竞争空白=9, 关键词难度机会=5, SERP相关性=3.75, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### JPEG 2000 JP2 Image

- 代表查询：`how to open jp2 file`
- 主要关键词月搜索量：`140.0`
- 月搜索量≥10的有效查询数：`19`
- SERP 相关性：`100%`
- 直接查看器域名：`listoffreeware.com, products.groupdocs.app, products.groupdocs.cloud`
- 关键词难度：`0`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=0.75, 查看器竞争空白=9, 关键词难度机会=5, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### DirectDraw Surface

- 代表查询：`dds file viewer`
- 主要关键词月搜索量：`260.0`
- 月搜索量≥10的有效查询数：`15`
- SERP 相关性：`78%`
- 直接查看器域名：`ddsviewer.com, forum.giants-software.com, forums.ogre3d.org, imagetostl.com, jumpshare.com, nexusmods.com, youtube.com`
- 关键词难度：`3`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=1.1, 查看器竞争空白=3, 关键词难度机会=4.85, SERP相关性=3.89, 趋势方向=3.91, Overview覆盖率=4, SERP证据=3, 趋势证据=3`

### Microsoft Visio Binary Drawing

- 代表查询：`how to open vsd file without visio`
- 主要关键词月搜索量：`210.0`
- 月搜索量≥10的有效查询数：`22`
- SERP 相关性：`62%`
- 直接查看器域名：`lifewire.com, onlinedocumentviewer.com, reddit.com`
- 关键词难度：`0`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=2.52, 查看器竞争空白=9, 关键词难度机会=5, SERP相关性=3.12, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### Industry Foundation Classes

- 代表查询：`ifc file viewer`
- 主要关键词月搜索量：`390.0`
- 月搜索量≥10的有效查询数：`4`
- SERP 相关性：`100%`
- 直接查看器域名：`catenda.com, ifcviewer.de, ifcvieweronline.eu, nomic.ai, reddit.com, smartcadsoft.com, tripo3d.ai, vectraxd.com, viewer.webtech360.com`
- 关键词难度：`32`
- 评分组成：`有效搜索量=26, 查询广度=8, 查看意图纯度=4.77, 查看器竞争空白=3, 关键词难度机会=3.4, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=3`

### CorelDRAW Drawing

- 代表查询：`coreldraw file viewer`
- 主要关键词月搜索量：`260.0`
- 月搜索量≥10的有效查询数：`13`
- SERP 相关性：`89%`
- 直接查看器域名：`coreldrawdesign.com, filestash.app, imagetostl.com, oit.va.gov, play.google.com, systoolsgroup.com`
- 关键词难度：`13`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=1.91, 查看器竞争空白=6, 关键词难度机会=4.35, SERP相关性=4.44, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`
