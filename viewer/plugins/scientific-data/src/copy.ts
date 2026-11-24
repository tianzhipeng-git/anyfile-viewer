import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export type ScientificCopy = {
  readonly loading: string;
  readonly filterPlaceholder: string;
  readonly rootOverview: string;
  readonly groupsAndDatasets: string;
  readonly noMatches: string;
  readonly emptyGroup: string;
  readonly tabData: string;
  readonly tabHeatmap: string;
  readonly tabAttributes: string;
  readonly formatLabel: string;
  readonly fileSizeLabel: string;
  readonly dimensionsLabel: string;
  readonly dtypeLabel: string;
  readonly shapeLabel: string;
  readonly elementsLabel: string;
  readonly orderLabel: string;
  readonly chunksLabel: string;
  readonly filtersLabel: string;
  readonly colName: string;
  readonly colKind: string;
  readonly colType: string;
  readonly colShape: string;
  readonly colValue: string;
  readonly kindGroup: string;
  readonly kindDataset: string;
  readonly kindLink: string;
  readonly rowAxis: string;
  readonly colAxis: string;
  readonly fixedIndex: string;
  readonly prevRows: string;
  readonly nextRows: string;
  readonly prevCols: string;
  readonly nextCols: string;
  readonly rowsRange: (start: number, end: number, total: number) => string;
  readonly colsRange: (start: number, end: number, total: number) => string;
  readonly noAttributes: string;
  readonly emptyDataset: string;
  readonly loadError: string;
  readonly colormapLabel: string;
  readonly rangeLabel: string;
  readonly rangeAuto: string;
  readonly rangeClipped: string;
  readonly heatmapHint: string;
  readonly heatmapHover: (row: number, col: number, value: string) => string;
  readonly heatmapNoFinite: string;
  readonly downsampledNote: (sr: number, sc: number, w: number, h: number) => string;
  readonly truncatedGroup: string;
};

const EN: ScientificCopy = {
  loading: "Opening scientific data container…",
  filterPlaceholder: "Filter groups & datasets…",
  rootOverview: "Container Overview",
  groupsAndDatasets: "Hierarchy",
  noMatches: "No matching groups or datasets.",
  emptyGroup: "This group has no children.",
  tabData: "Slice Table",
  tabHeatmap: "2D Preview",
  tabAttributes: "Attributes",
  formatLabel: "Format",
  fileSizeLabel: "File Size",
  dimensionsLabel: "Dimensions",
  dtypeLabel: "Data Type",
  shapeLabel: "Shape",
  elementsLabel: "Elements",
  orderLabel: "Storage Order",
  chunksLabel: "Chunks",
  filtersLabel: "Compression / Filters",
  colName: "Name",
  colKind: "Kind",
  colType: "Type",
  colShape: "Shape",
  colValue: "Value",
  kindGroup: "Group",
  kindDataset: "Dataset",
  kindLink: "Link",
  rowAxis: "Row axis",
  colAxis: "Col axis",
  fixedIndex: "Axis",
  prevRows: "Prev rows",
  nextRows: "Next rows",
  prevCols: "Prev cols",
  nextCols: "Next cols",
  rowsRange: (start, end, total) => `Rows ${start}–${end} / ${total}`,
  colsRange: (start, end, total) => `Cols ${start}–${end} / ${total}`,
  noAttributes: "No attributes on this node.",
  emptyDataset: "Dataset is empty (0 elements).",
  loadError: "Unable to read this item from the container.",
  colormapLabel: "Colormap",
  rangeLabel: "Scale",
  rangeAuto: "Full min–max",
  rangeClipped: "2%–98% clip",
  heatmapHint: "Hover over the 2D slice to inspect values.",
  heatmapHover: (row, col, value) => `[${row}, ${col}] = ${value}`,
  heatmapNoFinite: "No finite numeric values in this slice.",
  downsampledNote: (sr, sc, w, h) =>
    sr > 1 || sc > 1
      ? `Subsampled preview (${w}×${h}, stride ${sr}×${sc})`
      : `Full resolution (${w}×${h})`,
  truncatedGroup: "Large group: showing first 5,000 entries.",
};

const ZH: ScientificCopy = {
  loading: "正在打开科学数据容器…",
  filterPlaceholder: "筛选分组与数据集…",
  rootOverview: "容器概览",
  groupsAndDatasets: "层级结构",
  noMatches: "没有匹配的分组或数据集。",
  emptyGroup: "该分组下没有子节点。",
  tabData: "切片数据表",
  tabHeatmap: "2D 切片预览",
  tabAttributes: "属性与元数据",
  formatLabel: "格式",
  fileSizeLabel: "文件大小",
  dimensionsLabel: "维度定义",
  dtypeLabel: "数据类型",
  shapeLabel: "形状",
  elementsLabel: "元素总数",
  orderLabel: "存储顺序",
  chunksLabel: "分块 (Chunks)",
  filtersLabel: "压缩 / 过滤器",
  colName: "名称",
  colKind: "类型",
  colType: "数据类型",
  colShape: "形状",
  colValue: "值",
  kindGroup: "分组",
  kindDataset: "数据集",
  kindLink: "链接",
  rowAxis: "行轴",
  colAxis: "列轴",
  fixedIndex: "轴",
  prevRows: "上一页行",
  nextRows: "下一页行",
  prevCols: "上一组列",
  nextCols: "下一组列",
  rowsRange: (start, end, total) => `行 ${start}–${end} / ${total}`,
  colsRange: (start, end, total) => `列 ${start}–${end} / ${total}`,
  noAttributes: "该节点没有属性。",
  emptyDataset: "数据集为空（0 个元素）。",
  loadError: "无法读取该节点的数据。",
  colormapLabel: "配色方案",
  rangeLabel: "值域映射",
  rangeAuto: "完整最小–最大",
  rangeClipped: "2%–98% 截断",
  heatmapHint: "悬停在 2D 切片上查看坐标与数值。",
  heatmapHover: (row, col, value) => `[${row}, ${col}] = ${value}`,
  heatmapNoFinite: "当前切片中没有有限数值。",
  downsampledNote: (sr, sc, w, h) =>
    sr > 1 || sc > 1
      ? `降采样预览（${w}×${h}，步长 ${sr}×${sc}）`
      : `原始分辨率（${w}×${h}）`,
  truncatedGroup: "超大分组：仅展示前 5,000 项。",
};

export function getScientificCopy(locale: Locale): ScientificCopy {
  return selectMessages(locale, { en: EN, "zh-CN": ZH });
}
