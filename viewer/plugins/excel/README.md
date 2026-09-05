# Excel 查看器 (`excel-workbook`)

解析电子表格工作簿并以分页表格形式只读展示。

## 基本介绍

- **插件 ID**：`excel-workbook`
- **支持格式**：`.xlsx`、`.xlsm`、`.xlsb`、`.xls`、`.ods`、`.csv`、`.tsv` 及多种遗留格式（见 [src/manifest.ts](src/manifest.ts) 完整列表）
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
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-ui` | 共享分页表格界面 |
| `xlsx@0.20.3（SheetJS CDN 包）` | SheetJS 工作簿解析 |

## 已知限制

- 不渲染公式结果以外的 Excel 特性：图表、数据透视表、条件格式、合并单元格布局、宏
- `.xlsm` 宏会被忽略，不执行
- 输入 50 MiB、解析 100 万单元格和 100 工作表为资源上限，超出报 `resource-limit`；每表只显示前 200 列，更多列截断显示并提示
- 大工作簿全量解析进内存，打开阶段可能较慢
- 部分冷门遗留格式（`.wk1` 等）依赖 SheetJS 兼容性，可能解析失败
- CSV/TSV 同时可能进入 data 等插件候选；宿主按 probe 等级和同级注册顺序选择，本插件使用 SheetJS 解析
- 只读，不可编辑或重新计算公式

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例目录](examples/)：用于本地打开检查。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/excel-viewer test
```
