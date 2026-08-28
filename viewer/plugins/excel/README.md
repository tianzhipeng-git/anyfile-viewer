# Excel 查看器 (`excel-workbook`)

解析电子表格工作簿并以分页表格形式只读展示。

## 基本介绍

- **插件 ID**：`excel-workbook`
- **支持格式**：`.xlsx`、`.xlsm`、`.xlsb`、`.xls`、`.ods`、`.csv`、`.tsv` 及多种遗留格式（见 `manifest.ts` 完整列表）
- **能力**：多工作表切换、分页浏览（每页 100 行）、列标 A/B/C… 显示
- **示例文件**：`examples/demo.xlsx`

## 实现原理

1. **打开流程**（`src/index.ts`）
   - 文件大小上限 50 MiB
   - 对 ZIP 系格式（xlsx/ods 等）校验 `PK` 魔数
   - 流式读取为 `ArrayBuffer`

2. **解析**（SheetJS / `xlsx`）
   - `read(bytes, { type: "array", dense: true, ... })` 解析工作簿
   - 关闭公式、样式、HTML 解析以提速并减内存
   - 每表 `sheet_to_json({ header: 1 })` 转为二维数组

3. **资源护栏**
   - 最多 100 个工作表
   - 最多 100 万单元格总量
   - 每表最多显示 200 列

4. **UI**（`@anyfile/viewer-ui` 的 `createPagedTableViewer`）
   - 工作表下拉选择 + 上一页/下一页
   - 单元格值格式化为字符串（日期走 `toLocaleString`）

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议 |
| `@anyfile/viewer-ui` | 分页表格 UI 组件 |
| `xlsx@0.20.3`（SheetJS CDN 包） | 工作簿解析 |

## 已知限制

- 不渲染公式结果以外的 Excel 特性：图表、数据透视表、条件格式、合并单元格布局、宏
- `.xlsm` 宏会被忽略，不执行
- 50 MiB / 100 万单元格 / 200 列 / 100 工作表为硬上限，超出报 `resource-limit`
- 大工作簿全量解析进内存，打开阶段可能较慢
- 部分冷门遗留格式（`.wk1` 等）依赖 SheetJS 兼容性，可能解析失败
- CSV/TSV 与 Excel 插件共用 manifest 扩展名，实际由 SheetJS 按内容识别
- 只读，不可编辑或重新计算公式
