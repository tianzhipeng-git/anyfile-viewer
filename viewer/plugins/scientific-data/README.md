# 科学多维数据容器查看器 (`scientific-data`)

在浏览器本地只读浏览 HDF5、NetCDF 与 MATLAB MAT 多维科学数据容器：分组树、属性元数据、N 维切片数据表与 2D 热力图切片预览。

## 基本介绍

- **插件 ID**：`scientific-data`
- **格式入口**：`.h5` `.hdf5`（HDF5）、`.nc` `.nc4`（NetCDF Classic / 64-bit Offset / CDF-5 / NetCDF-4）、`.mat`（MATLAB Level 4 / Level 5 / v7.3 HDF5）
- **支持等级**：HDF5 / NetCDF / MATLAB Level 5 / MATLAB v7.3 文件头签名匹配为 4；MATLAB Level 4 为 3。
- **能力**：按需展开分组与结构体层级、筛选节点、查看属性与维度元数据、N 维轴选择与固定索引切片、行列窗口分页表格、2D 数值切片 Canvas 热力图（Viridis / Inferno / Coolwarm / Grayscale、2%–98% 截断、悬停数值读取）。

## 实现原理

1. [src/probe.ts](src/probe.ts) 最多读取前 8 KiB，按魔数识别 HDF5 超级块（含 512 字节用户块偏移的 MATLAB v7.3）、NetCDF `CDF\x01`/`CDF\x02`/`CDF\x05`、MATLAB Level 5 `0x0100 + IM/MI` 与 MATLAB Level 4 头部。
2. **HDF5 / NetCDF-4 / MATLAB v7.3**：[src/hdf5.worker.ts](src/hdf5.worker.ts) 在可终止的 Web Worker 中加载同源 `/vendor/h5wasm/0.10.3/`（`h5wasm` 0.10.3），通过 Emscripten `WORKERFS` 挂载用户 `File`，由 `libhdf5` 按需随机读取切片与元数据，大文件不整体载入 WASM 内存；[src/hdf5-engine.ts](src/hdf5-engine.ts) 由 Worker 与 Node 单测共用。
3. **NetCDF Classic / 64-bit / CDF-5**：[src/netcdf-classic.ts](src/netcdf-classic.ts) 纯 TypeScript 通过 `Blob.slice` 增量解析头部（上限 32 MiB）并按需定位固定变量与无限记录变量切片。
4. **MATLAB Level 5 / Level 4**：[src/matlab-parse.ts](src/matlab-parse.ts) 与 [src/matlab-mat.ts](src/matlab-mat.ts) 纯 TypeScript 扫描顶层变量标签（对 `miCOMPRESSED` 变量仅流式解压前 1 KiB 获取名称与形状，选中后再有界解压），支持列主序多维数值、复数、字符矩阵、稀疏矩阵、嵌套 `struct` 与 `cell`。
5. [src/ui.ts](src/ui.ts) 与 [src/heatmap.ts](src/heatmap.ts) 基于 `@anyfile/viewer-ui` 的分栏检查器渲染层级树、属性表、切片分页表与 2D 热力图。

## 依赖

| 包 | 用途 |
|---|---|
| `h5wasm` `0.10.3`（NIST / HDF5 BSD-3-Clause） | HDF5 / NetCDF-4 / MATLAB v7.3 Worker WASM 解析与 `WORKERFS` 按需读取 |
| `fflate` `0.8.3`（MIT） | MATLAB Level 5 `miCOMPRESSED` 有界流式 zlib 解压 |
| `@anyfile/runtime-assets` | Worker RPC（请求关联、超时、取消、终止） |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化 |
| `@anyfile/viewer-ui` | 分栏检查器、表格、标签页与主题 token |

## 已知限制

- 仅提供只读检查，不执行 MATLAB 脚本/对象方法，不修改或导出容器。
- HDF5 仅支持 `h5wasm` 内置过滤器（如 gzip/deflate、shuffle、fletcher32），自定义第三方插件过滤器（如未编入的外部压缩滤镜）无法读取对应分块数据集。
- 单个分组最多展示前 5,000 项，单节点属性最多 512 项，单次表格切片最多 100,000 单元格，2D 热力图降采样上限为 256×256。
- MATLAB Level 5 单个压缩变量解压上限为 64 MiB，嵌套深度上限 32；NetCDF Classic 头部上限 32 MiB。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)；真实样例见 [examples/](examples/README.md)。

```bash
pnpm test viewer/plugins/scientific-data
```
