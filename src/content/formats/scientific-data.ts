import { defineFormat } from "./define-format";

export const h5Format = defineFormat(
  "h5",
  "code-data",
  4,
  {
    name: "HDF5 data container",
    title: "Open HDF5 and H5 Files Online",
    description: "Inspect HDF5 (.h5, .hdf5) groups, attributes, multidimensional slices and 2D heatmaps locally in your browser.",
    introduction: "Hierarchical Data Format 5 (HDF5) organizes large scientific, geospatial and machine-learning datasets into groups, typed multidimensional arrays and attributes. Anyfile mounts the selected file inside a local Web Worker running libhdf5 WebAssembly so you can browse hierarchies, slice tensors and preview 2D heatmaps without uploading gigabyte-scale files.",
    canShow: [
      "Expandable group and dataset tree with shapes, data types and link targets",
      "Root, group and dataset attributes alongside chunking and compression filter metadata",
      "Paged N-dimensional slice tables with axis selectors and fixed-index controls",
      "Interactive 2D numeric heatmap previews with selectable colormaps and hover value readouts",
    ],
    limitations: [
      "Datasets compressed with external third-party HDF5 filter plugins not built into h5wasm cannot be decoded",
      "Read-only inspection: datasets and attributes cannot be edited or written back",
    ],
    faq: [
      {
        question: "Can I open large HDF5 files without uploading them?",
        answer: "Yes. Anyfile mounts your local file via WORKERFS inside a browser Worker so libhdf5 reads only the metadata and array slices you request, never uploading the file.",
      },
    ],
  },
  {
    name: "HDF5 科学数据容器",
    title: "在线打开 HDF5 与 H5 文件",
    description: "在浏览器本地检查 HDF5（.h5、.hdf5）分组树、属性元数据、多维数组切片与 2D 热力图。",
    introduction: "HDF5（Hierarchical Data Format 5）广泛用于科研、遥感与人工智能领域，用分组、多维数值数组与属性组织大规模数据。Anyfile 在本地 Web Worker 中通过 libhdf5 WebAssembly 挂载文件，按需读取层级、切片与 2D 热力图，无需上传大文件。",
    canShow: [
      "可展开的分组与数据集层级树，展示形状、数据类型与链接目标",
      "根级、分组与数据集属性，以及分块（chunks）和压缩过滤器信息",
      "支持轴切换与固定索引的 N 维分页切片数据表",
      "支持配色切换、值域截断与悬停读数的 2D 数值热力图预览",
    ],
    limitations: [
      "使用未编入 h5wasm 的外部第三方压缩滤镜的数据集无法解码",
      "仅支持只读浏览，不能修改或回写数据集与属性",
    ],
    faq: [
      {
        question: "几百 MB 的 HDF5 文件会上传到服务器吗？",
        answer: "不会。Anyfile 在浏览器 Worker 中通过 WORKERFS 按需读取你查看的分组与切片，文件始终留在本地。",
      },
    ],
  },
  {},
  undefined,
  ["hdf5"],
);

export const ncFormat = defineFormat(
  "nc",
  "code-data",
  4,
  {
    name: "NetCDF data file",
    title: "Open NetCDF NC and NC4 Files Online",
    description: "Browse NetCDF Classic, 64-bit Offset, CDF-5 and NetCDF-4 (.nc, .nc4) variables, dimensions and 2D slices locally.",
    introduction: "NetCDF (Network Common Data Form) is the standard container for meteorology, oceanography and climate model grids. Anyfile reads NetCDF Classic, 64-bit Offset and CDF-5 files directly via on-demand byte slices and opens HDF5-backed NetCDF-4 files in a local libhdf5 Worker.",
    canShow: [
      "Named dimensions (including unlimited record dimensions) and global CF attributes",
      "Variable schemas, units, attributes and paged multidimensional data slices",
      "2D Canvas heatmap previews across latitude/longitude or arbitrary tensor axes",
    ],
    limitations: [
      "Map projections, coastlines and geographic tile overlays are not drawn on top of 2D slices",
      "Classic headers above 32 MiB and custom external HDF5 filters are not supported",
    ],
    faq: [
      {
        question: "Does Anyfile support both NetCDF-3 and NetCDF-4?",
        answer: "Yes. Classic (CDF-1), 64-bit Offset (CDF-2), CDF-5 and HDF5-based NetCDF-4 (.nc and .nc4) files all open locally in the browser.",
      },
    ],
  },
  {
    name: "NetCDF 科学数据文件",
    title: "在线打开 NetCDF NC 与 NC4 文件",
    description: "在本地浏览器中查看 NetCDF Classic、64-bit、CDF-5 与 NetCDF-4（.nc、.nc4）维度、变量与 2D 切片。",
    introduction: "NetCDF 是气象、海洋与气候网格数据的常用容器格式。Anyfile 对 NetCDF Classic、64-bit Offset 与 CDF-5 直接通过按需字节切片读取，对基于 HDF5 的 NetCDF-4 则在本地 libhdf5 Worker 中打开，无需安装专业软件或上传数据。",
    canShow: [
      "命名维度（含无限记录维度）与全局 CF 约定属性",
      "变量类型、单位、属性以及按需分页的多维切片数据表",
      "任意两轴的 2D 热力图切片预览与数值悬停检查",
    ],
    limitations: [
      "不在 2D 切片上叠加地图投影、海岸线或在线地图瓦片",
      "不支持超过 32 MiB 的 Classic 头部以及未内置的外部 HDF5 压缩滤镜",
    ],
    faq: [
      {
        question: "同时支持 NetCDF-3 和 NetCDF-4 吗？",
        answer: "支持。Classic（CDF-1）、64-bit Offset（CDF-2）、CDF-5 以及基于 HDF5 的 NetCDF-4（.nc 与 .nc4）均可在浏览器本地打开。",
      },
    ],
  },
  {},
  undefined,
  ["nc4"],
);

export const matFormat = defineFormat(
  "mat",
  "code-data",
  4,
  {
    name: "MATLAB MAT-file",
    title: "Open MATLAB MAT Files Online Without MATLAB",
    description: "Inspect MATLAB .mat workspaces (Level 4, Level 5 and v7.3 HDF5) locally in your browser without MATLAB.",
    introduction: "MATLAB saves workspace variables—matrices, N-D arrays, structs, cells, strings, complex numbers and sparse matrices—into binary .mat files. Anyfile inspects Level 4 and Level 5 MAT-files directly in TypeScript with lazy decompression and opens v7.3 HDF5 MAT-files in a local libhdf5 Worker.",
    canShow: [
      "Top-level workspace variables plus navigable nested struct fields and cell arrays",
      "Column-major numeric, logical, complex, character and sparse matrix slices",
      "2D numeric heatmap previews with min/max scaling and hover value inspection",
    ],
    limitations: [
      "MATLAB scripts, Simulink models and custom opaque class methods are never executed",
      "Individual compressed Level 5 variables above 64 MiB decompressed size hit the browser safety cap",
    ],
    faq: [
      {
        question: "Can I open a .mat file without installing MATLAB?",
        answer: "Yes. Level 4, compressed Level 5 and v7.3 HDF5 .mat files open directly in your browser with full variable inspection and 2D slice previews.",
      },
    ],
  },
  {
    name: "MATLAB MAT 数据文件",
    title: "无需 MATLAB 在线打开 MAT 文件",
    description: "无需安装 MATLAB，在浏览器本地检查 MATLAB .mat 工作区（Level 4、Level 5 与 v7.3 HDF5）。",
    introduction: "MATLAB 将工作区中的矩阵、多维数组、结构体、元胞数组、字符串、复数与稀疏矩阵保存为二进制 .mat 文件。Anyfile 用纯 TypeScript 惰性解压读取 Level 4 与 Level 5 MAT 文件，并在本地 libhdf5 Worker 中打开 v7.3 HDF5 MAT 文件。",
    canShow: [
      "顶层工作区变量，以及可展开浏览的嵌套 struct 字段与 cell 元胞数组",
      "按列主序准确切片的数值、逻辑、复数、字符与稀疏矩阵数据",
      "带配色与悬停数值读取的 2D 矩阵热力图预览",
    ],
    limitations: [
      "不执行 MATLAB 脚本、Simulink 模型或自定义类方法",
      "Level 5 单个压缩变量解压后超过 64 MiB 时会触发浏览器安全上限",
    ],
    faq: [
      {
        question: "没有安装 MATLAB 能打开 .mat 文件吗？",
        answer: "可以。Level 4、压缩 Level 5 与 v7.3 HDF5 格式的 .mat 文件均可直接在浏览器本地打开并查看变量与 2D 切片。",
      },
    ],
  },
);
