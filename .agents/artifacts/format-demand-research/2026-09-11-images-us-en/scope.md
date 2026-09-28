# 图片格式需求研究范围

用户已确认：20 个候选，美国（2840）／英语（en）；方法论 v1.1，默认参数。

候选配置见 candidates.json；dry-run-plan.json 记录 61–62 次调用上界。只使用 DataForSEO 需求数据，没有补入人工 SERP 评审或其他市场数据。

## 已支持格式核对

依据 src/lib/viewer-registrations.ts 与 viewer/plugins/ 下 browser-image、general-raster、modern-raster、camera-raw、photoshop、pixelmator-pxd、postscript、svg 的 Manifest，并交叉读取 docs/images/support-matrix.md、roadmap.md、format-inventory.md。

排除已有接入的浏览器原生图片、SVG、TGA、Netpbm、TIFF 及其已声明扩展、HEIC/HEIF、JXL、15 种相机 RAW 扩展名、PSD、PSB、PXD、AI、EPS、PS。支持范围存在限制不等于全新格式未支持。

首轮范围并不覆盖所有剩余图片格式；未入选格式不能从本轮结果推断需求低。KTX 与 KTX2 单独评分；JP2 本轮不代表所有 JPEG 2000 裸码流格式。

## 解释边界

最终排名为搜索需求推荐，不证明浏览器实现可行性。有效月搜索量采用主关键词加封顶的次要关键词贡献，不是独立用户数或预计网站流量。

自动代表词选择中，ORA 指向 Oracle 错误，CLIP 指向用 Clip Studio Paint 打开 PSD。这是查询污染，不能直接解释为 OpenRaster 或 CLIP 文件查看需求；保留原始算法结果并在报告中说明，不修改 checkpoint.json 或 evidence.json，不自动改词重跑。
