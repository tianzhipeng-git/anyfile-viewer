# 文件格式需求研究报告

方法论版本：1.1
市场：地区代码 `2840`，语言 `en`
生成时间：`2026-09-11T11:30:53.304410+00:00`
配置 SHA-256：`0bb123d468ac39095d812f330c0c2eeccc4cbd8e6c62498c9f99df48c0d86d01`
DataForSEO 报告成本：`0.4341` 美元

本报告衡量搜索需求与搜索机会，不代表技术实现可行性。

## 本轮决策建议

以“扩展新图片格式”为目标，建议先开展 JP2 → DDS → EXR 的技术可行性评估；这是按原始需求评分形成的普通图片／纹理候选顺序，并未评估实现成本。DICOM 的需求评分最高，若产品愿意进入医学图像领域，应单独优先立项评估。PCX 和 XCF 可作为后续候选。

- **JP2（62.6 分）**：有效月搜索量 262.5，19 个查看相关词达到月搜索量 10；代表词难度为 0，自动检测到 4 个相关查看器域名。它的需求规模小于 DDS、EXR，但查询更广、竞争机会评分更高，因此在普通图片候选中居首。
- **DDS（60.9 分）**：有效月搜索量 520，15 个有效查询；`dds file viewer` 月搜索量 260，`dds viewer online` 为 70。近一季相较前一季的代表词趋势约下降 66%，所以不能称为增长机会；它仍有较明确的文件查看需求。
- **EXR（59.2 分）**：有效月搜索量 627.5，12 个有效查询；主要由 `open exr file` 的 590 支撑，`exr viewer online` 只有 10。OpenEXR 名称本身含有 open，算法保留了 `what is open exr file`、`open exr file format` 等词，查看意图存在一定高估可能，应谨慎解释。
- **DICOM（64.6 分）**：有效月搜索量 1430，`dicom viewer online` 本身为 720；需求不只是平台特定查询。不过代表词为 `dicom file viewer mac`，自动检测到 9 个相关查看器域名，竞争机会得分较低。需求评分不能证明轻量通用图片预览足以满足这些用户。
- **PCX（55.1）与 XCF（54.3）**：有效月搜索量分别为 90、85，作为第二批候选。PCX 的机器相关性只有 44%，略高于歧义门槛，证据弱于 JP2、EXR；XCF 仍属于观察名单，不应把 0.8 分差距解释为确定的优先级差异。

## 影响结论的证据限制

1. **ORA 与 CLIP 暂不用于排期决策。** ORA 的自动代表词是 Oracle 错误 `ora-28759: failure to open file`；CLIP 的代表词是 `how to open psd file in clip studio paint`，指向 PSD 而非 CLIP 文件。本轮上下文规则未隔离这些查询，ORA 得到 58.9 分也不能作为 OpenRaster 需求依据。下方保留原始算法结果，不修改评分、checkpoint 或 evidence；这是根据机器选词暴露的语义问题做出的限制说明，没有增加人工 SERP 评审。重新限定主体需要另行批准的新查询。
2. **没有候选达到 70 分的“强需求”门槛。** 当前首批候选均属于值得技术可行性研究，而不是已经验证应立即开发。
3. **19/20 个候选缺少可用趋势。** 返回 52 个点并不保证能计算增长；全零或不可用序列仍按缺失处理，不代表需求下跌。仅 DDS 有可计算的趋势。
4. **表中的 0 不能解释为市场需求为零。** FITS 的查看词返回空搜索量，SRW/X3F 没有取得足够查看关键词指标，且覆盖率低。原始 evidence 保留缺失值，表中 0 是评分汇总值。关键词覆盖率只表示返回记录比例，不保证每条记录均有搜索量和难度数值。
5. **竞争指标是文本启发式结果。** “直接查看器域名数”是算法检测值，不是已逐一核实的独立竞品数量；相差几分只宜用于初筛。没有人工核验搜索结果页面，也未额外使用 Reddit 等数据源。
6. **指标仅适用于本轮美国／英语、批准的 20 个候选和所选关键词。** 有效月搜索量是最大查看词搜索量加封顶的次要词贡献，不是独立用户数、网站流量预测或全球需求。查看需求也包含桌面与软件内打开场景。未入选格式不能据此认定低需求。

## 可复现材料

本轮执行 Keyword Suggestions 20 次、Keyword Overview 1 次、SERP Advanced 20 次、Trends Explore 20 次，共 61 次；响应级费用合计 0.43408 美元。未重试付费请求。

- [候选配置](candidates.json)、[无网络调用计划](dry-run-plan.json)、[支持范围核对](scope.md)
- [机器报告](report.json)、[标准化证据](evidence.json)、[原始响应检查点](checkpoint.json)

## 原始评分排名

| 排名 | 格式 | 得分 | 有效月搜索量 | 查看意图纯度 | 覆盖率 | 直接查看器域名数 | 趋势 | 证据置信度 | 建议 | 标记 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | DICOM Image (dcm) | 64.6 | 1430.0 | 53% | 100% | 9 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 2 | JPEG 2000 JP2 Image (jp2) | 62.6 | 262.5 | 13% | 100% | 4 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 3 | DirectDraw Surface (dds) | 60.9 | 520.0 | 22% | 100% | 6 | -66% | 10.0/10 | 值得开展技术可行性研究 | — |
| 4 | OpenEXR Image (exr) | 59.2 | 627.5 | 25% | 100% | 5 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 5 | OpenRaster (ora) | 58.9 | 195.0 | 21% | 95% | 0 | 无数据 | 6.8/10 | 值得开展技术可行性研究 | 关键词覆盖不完整, 趋势证据缺失 |
| 6 | PC Paintbrush Image (pcx) | 55.1 | 90.0 | 18% | 100% | 1 | 无数据 | 7.0/10 | 值得开展技术可行性研究 | 趋势证据缺失 |
| 7 | GIMP Image (xcf) | 54.3 | 85.0 | 6% | 100% | 3 | 无数据 | 7.0/10 | 观察名单 | 趋势证据缺失 |
| 8 | Apple Icon Image (icns) | 44.2 | 20.0 | 4% | 100% | 3 | 无数据 | 7.0/10 | 观察名单 | 趋势证据缺失 |
| 9 | Krita Document (kra) | 42.7 | 25.0 | 6% | 98% | 1 | 无数据 | 6.9/10 | 观察名单 | 关键词覆盖不完整, 趋势证据缺失, 关键词难度缺失 |
| 10 | Affinity Photo Document (afphoto) | 42.6 | 10.0 | 33% | 60% | 0 | 无数据 | 5.4/10 | 观察名单 | 关键词覆盖不完整, 趋势证据缺失, 关键词难度缺失 |
| 11 | Clip Studio Paint Document (clip) | 42.3 | 10.0 | 2% | 92% | 0 | 无数据 | 6.7/10 | 观察名单 | 关键词覆盖不完整, 趋势证据缺失, 关键词难度缺失 |
| 12 | JPEG XR Image (jxr) | 42.2 | 15.0 | 5% | 86% | 2 | 无数据 | 6.4/10 | 观察名单 | 关键词覆盖不完整, 趋势证据缺失, 关键词难度缺失 |
| 13 | Khronos Texture (ktx) | 40.5 | 20.0 | 35% | 100% | 3 | 无数据 | 7.0/10 | 观察名单 | 趋势证据缺失, 关键词难度缺失 |
| 14 | PaintTool SAI Document (sai) | 40.5 | 12.5 | 12% | 80% | 1 | 无数据 | 6.2/10 | 观察名单 | 关键词覆盖不完整, 趋势证据缺失, 关键词难度缺失 |
| 15 | NIfTI Image (nii, nii.gz) | 35.0 | 32.5 | 12% | 82% | 7 | 无数据 | 6.3/10 | 根据当前需求证据降低优先级 | 关键词覆盖不完整, 趋势证据缺失 |
| 16 | Khronos Texture 2 (ktx2) | 31.4 | 10.0 | 20% | 50% | 6 | 无数据 | 5.0/10 | 根据当前需求证据降低优先级 | 关键词覆盖不完整, 趋势证据缺失, 关键词难度缺失 |
| 17 | Radiance HDR Image (hdr) | 30.1 | 10.0 | 10% | 57% | 5 | 无数据 | 5.3/10 | 根据当前需求证据降低优先级 | 关键词覆盖不完整, 趋势证据缺失 |
| 18 | Sigma X3F Image (x3f) | 20.3 | 0.0 | 0% | 20% | 4 | 无数据 | 3.8/10 | 根据当前需求证据降低优先级 | 关键词覆盖不足, 缺少月搜索量≥10的关键词, 趋势证据缺失, 关键词难度缺失 |
| 19 | Samsung RAW Image (srw) | 19.2 | 0.0 | 0% | 33% | 4 | 无数据 | 4.3/10 | 根据当前需求证据降低优先级 | 关键词覆盖不足, 缺少月搜索量≥10的关键词, 趋势证据缺失, 关键词难度缺失 |
| 20 | FITS Image (fits, fit, fts) | 15.8 | 0.0 | 0% | 25% | 6 | 无数据 | 4.0/10 | 根据当前需求证据降低优先级 | 关键词覆盖不足, 缺少月搜索量≥10的关键词, 趋势证据缺失, 关键词难度缺失 |

## 证据明细

### DICOM Image

- 代表查询：`dicom file viewer mac`
- 主要关键词月搜索量：`1000.0`
- 月搜索量≥10的有效查询数：`11`
- SERP 相关性：`100%`
- 直接查看器域名：`apps.apple.com, dicomviewer.net, imaios.com, microdicom.com, osirix-viewer.com, postdicom.com, radiologycafe.com, reddit.com, santesoft.com`
- 关键词难度：`17`
- 评分组成：`有效搜索量=32.8, 查询广度=10, 查看意图纯度=2.65, 查看器竞争空白=3, 关键词难度机会=4.15, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### JPEG 2000 JP2 Image

- 代表查询：`how to open jp2 file`
- 主要关键词月搜索量：`140.0`
- 月搜索量≥10的有效查询数：`19`
- SERP 相关性：`100%`
- 直接查看器域名：`hirise.lpl.arizona.edu, imagetostl.com, jumpshare.com, play.google.com`
- 关键词难度：`0`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=0.65, 查看器竞争空白=9, 关键词难度机会=5, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### DirectDraw Surface

- 代表查询：`dds file viewer`
- 主要关键词月搜索量：`260.0`
- 月搜索量≥10的有效查询数：`15`
- SERP 相关性：`60%`
- 直接查看器域名：`convertico.com, ddsviewer.com, imagetostl.com, jumpshare.com, microsoft.com, youtube.com`
- 关键词难度：`3`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=1.08, 查看器竞争空白=6, 关键词难度机会=4.85, SERP相关性=3, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=3`

### OpenEXR Image

- 代表查询：`open exr file`
- 主要关键词月搜索量：`590.0`
- 月搜索量≥10的有效查询数：`12`
- SERP 相关性：`100%`
- 直接查看器域名：`exr-io.com, imagetostl.com, jumpshare.com, reddit.com, renderjuice.com`
- 关键词难度：`22`
- 评分组成：`有效搜索量=26, 查询广度=10, 查看意图纯度=1.27, 查看器竞争空白=6, 关键词难度机会=3.9, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### OpenRaster

- 代表查询：`ora-28759: failure to open file`
- 主要关键词月搜索量：`140.0`
- 月搜索量≥10的有效查询数：`7`
- SERP 相关性：`100%`
- 直接查看器域名：`无`
- 关键词难度：`0`
- 评分组成：`有效搜索量=18, 查询广度=8, 查看意图纯度=1.07, 查看器竞争空白=15, 关键词难度机会=5, SERP相关性=5, 趋势方向=0, Overview覆盖率=3.8, SERP证据=3, 趋势证据=0`

### PC Paintbrush Image

- 代表查询：`pcx file viewer`
- 主要关键词月搜索量：`50.0`
- 月搜索量≥10的有效查询数：`11`
- SERP 相关性：`44%`
- 直接查看器域名：`jumpshare.com`
- 关键词难度：`0`
- 评分组成：`有效搜索量=18, 查询广度=10, 查看意图纯度=0.89, 查看器竞争空白=12, 关键词难度机会=5, SERP相关性=2.22, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### GIMP Image

- 代表查询：`how to open xcf file`
- 主要关键词月搜索量：`50.0`
- 月搜索量≥10的有效查询数：`9`
- SERP 相关性：`100%`
- 直接查看器域名：`ezyzip.com, imagetostl.com, jumpshare.com`
- 关键词难度：`0`
- 评分组成：`有效搜索量=18, 查询广度=10, 查看意图纯度=0.31, 查看器竞争空白=9, 关键词难度机会=5, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### Apple Icon Image

- 代表查询：`icns viewer online`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`5`
- SERP 相关性：`100%`
- 直接查看器域名：`fileproinfo.com, filext.com, relikd.github.io`
- 关键词难度：`0`
- 评分组成：`有效搜索量=10, 查询广度=8, 查看意图纯度=0.22, 查看器竞争空白=9, 关键词难度机会=5, SERP相关性=5, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### Krita Document

- 代表查询：`how to open kra file`
- 主要关键词月搜索量：`20.0`
- 月搜索量≥10的有效查询数：`3`
- SERP 相关性：`100%`
- 直接查看器域名：`fileproinfo.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=10, 查询广度=6, 查看意图纯度=0.29, 查看器竞争空白=12, 关键词难度机会=2.5, SERP相关性=5, 趋势方向=0, Overview覆盖率=3.9, SERP证据=3, 趋势证据=0`

### Affinity Photo Document

- 代表查询：`how to open afphoto file`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`1`
- SERP 相关性：`100%`
- 直接查看器域名：`无`
- 关键词难度：`None`
- 评分组成：`有效搜索量=10, 查询广度=3, 查看意图纯度=1.67, 查看器竞争空白=15, 关键词难度机会=2.5, SERP相关性=5, 趋势方向=0, Overview覆盖率=2.4, SERP证据=3, 趋势证据=0`

### Clip Studio Paint Document

- 代表查询：`how to open psd file in clip studio paint`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`1`
- SERP 相关性：`100%`
- 直接查看器域名：`无`
- 关键词难度：`None`
- 评分组成：`有效搜索量=10, 查询广度=3, 查看意图纯度=0.1, 查看器竞争空白=15, 关键词难度机会=2.5, SERP相关性=5, 趋势方向=0, Overview覆盖率=3.7, SERP证据=3, 趋势证据=0`

### JPEG XR Image

- 代表查询：`open jxr file`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`3`
- SERP 相关性：`100%`
- 直接查看器域名：`fileviewerplus.com, speedtesting.herokuapp.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=10, 查询广度=6, 查看意图纯度=0.25, 查看器竞争空白=12, 关键词难度机会=2.5, SERP相关性=5, 趋势方向=0, Overview覆盖率=3.43, SERP证据=3, 趋势证据=0`

### Khronos Texture

- 代表查询：`ktx viewer online`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`6`
- SERP 相关性：`44%`
- 直接查看器域名：`imagetostl.com, ktxviewer.com, updf.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=10, 查询广度=8, 查看意图纯度=1.76, 查看器竞争空白=9, 关键词难度机会=2.5, SERP相关性=2.22, 趋势方向=0, Overview覆盖率=4, SERP证据=3, 趋势证据=0`

### PaintTool SAI Document

- 代表查询：`sai file viewer`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`2`
- SERP 相关性：`62%`
- 直接查看器域名：`filext.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=10, 查询广度=6, 查看意图纯度=0.62, 查看器竞争空白=12, 关键词难度机会=2.5, SERP相关性=3.12, 趋势方向=0, Overview覆盖率=3.2, SERP证据=3, 趋势证据=0`

### NIfTI Image

- 代表查询：`nifti file viewer`
- 主要关键词月搜索量：`30.0`
- 月搜索量≥10的有效查询数：`2`
- SERP 相关性：`89%`
- 直接查看器域名：`forum.posit.co, marketplace.visualstudio.com, mathworks.com, medical-image-viewer-nine.vercel.app, neuropsis.org, nitrc.org, volviz.com`
- 关键词难度：`7`
- 评分组成：`有效搜索量=10, 查询广度=6, 查看意图纯度=0.62, 查看器竞争空白=3, 关键词难度机会=4.65, SERP相关性=4.44, 趋势方向=0, Overview覆盖率=3.27, SERP证据=3, 趋势证据=0`

### Khronos Texture 2

- 代表查询：`ktx2 viewer online`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`1`
- SERP 相关性：`78%`
- 直接查看器域名：`3dpea.com, filext.com, github.com, ktxviewer.com, marketplace.visualstudio.com, reddit.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=10, 查询广度=3, 查看意图纯度=1, 查看器竞争空白=6, 关键词难度机会=2.5, SERP相关性=3.89, 趋势方向=0, Overview覆盖率=2, SERP证据=3, 趋势证据=0`

### Radiance HDR Image

- 代表查询：`hdr image viewer online`
- 主要关键词月搜索量：`10.0`
- 月搜索量≥10的有效查询数：`1`
- SERP 相关性：`56%`
- 直接查看器域名：`apps.microsoft.com, ezyzip.com, imagetostl.com, mathworks.com, viewer.openhdr.org`
- 关键词难度：`49`
- 评分组成：`有效搜索量=10, 查询广度=3, 查看意图纯度=0.5, 查看器竞争空白=6, 关键词难度机会=2.55, SERP相关性=2.78, 趋势方向=0, Overview覆盖率=2.29, SERP证据=3, 趋势证据=0`

### Sigma X3F Image

- 代表查询：`x3f viewer online`
- 主要关键词月搜索量：`0`
- 月搜索量≥10的有效查询数：`0`
- SERP 相关性：`100%`
- 直接查看器域名：`dpreview.com, filext.com, jumpshare.com, photokit.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=0, 查询广度=0, 查看意图纯度=0, 查看器竞争空白=9, 关键词难度机会=2.5, SERP相关性=5, 趋势方向=0, Overview覆盖率=0.8, SERP证据=3, 趋势证据=0`

### Samsung RAW Image

- 代表查询：`srw viewer online`
- 主要关键词月搜索量：`0`
- 月搜索量≥10的有效查询数：`0`
- SERP 相关性：`67%`
- 直接查看器域名：`apps.microsoft.com, fileinfo.com, fileviewerplus.com, filext.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=0, 查询广度=0, 查看意图纯度=0, 查看器竞争空白=9, 关键词难度机会=2.5, SERP相关性=3.33, 趋势方向=0, Overview覆盖率=1.33, SERP证据=3, 趋势证据=0`

### FITS Image

- 代表查询：`fits image viewer online`
- 主要关键词月搜索量：`0.0`
- 月搜索量≥10的有效查询数：`0`
- SERP 相关性：`67%`
- 直接查看器域名：`apps.apple.com, cloudynights.com, filestash.app, fits.gsfc.nasa.gov, fitsviewer.com, jumpshare.com`
- 关键词难度：`None`
- 评分组成：`有效搜索量=0, 查询广度=0, 查看意图纯度=0, 查看器竞争空白=6, 关键词难度机会=2.5, SERP相关性=3.33, 趋势方向=0, Overview覆盖率=1, SERP证据=3, 趋势证据=0`
