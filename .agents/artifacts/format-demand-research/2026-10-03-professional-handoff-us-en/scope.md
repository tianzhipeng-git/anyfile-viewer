# 本轮研究范围

用户授权选定 10 个候选并运行 format-demand-research。沿用此前建议的美国（2840）／英语（en），方法论 v1.1，默认配置。

| 格式族 | 扩展名 | 搜索主体／别名与歧义控制 |
|---|---|---|
| 建筑模型 | skp | SketchUp model/file；排除泛 3D 模型词 |
| BIM 交换 | ifc | Industry Foundation Classes；IFC file/viewer，排除机构缩写 |
| 流程图 | vsdx | Microsoft Visio XML drawing；与 VSD 分别评分 |
| 流程图 | vsd | Microsoft Visio binary drawing；不使用裸 VSD 医学缩写 |
| 项目计划 | mpp | Microsoft Project file；排除其他 MPP 缩写 |
| GPU 纹理 | dds | DirectDraw Surface；DDS file/DirectDraw |
| 高动态范围图片 | exr | OpenEXR；沿用前轮配置，检查 open 名称引入的意图污染 |
| JPEG 2000 图片 | jp2 | JP2/JPEG 2000；不代表所有裸码流 |
| 医学影像 | dcm | DICOM/DCM file |
| 平面设计 | cdr | CorelDRAW file；排除其他 CDR 缩写 |

## 现有支持核对

已检查 src/lib/viewer-registrations.ts、src/content/manifests.ts、viewer/plugins 下 Manifest、图片和 3D 支持矩阵；这 10 个格式尚无专用内容查看路径。Hex 兜底不算支持。已有 DWG、DXF、STEP、IGES、AI、EPS、PSD、PSB 不纳入。邮件不纳入。

本轮只使用 DataForSEO 需求证据，不引入人工 SERP 审查、遥测或其他市场数据。历史第一轮 v1.0 分数不与本轮混排。VSD/VSDX 的跨格式查询、EXR 中 open 名称歧义需在结果中检查说明，不能修改原始证据或为提高分数临时更改算法。
