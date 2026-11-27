import type { Locale } from "@anyfile/viewer-protocol";

export type DesignMessages = {
  readonly loadingReading: string;
  readonly loadingParsing: string;
  readonly loadingRendering: string;
  readonly invalidFile: string;
  readonly resourceLimit: string;
  readonly openFailed: string;
  readonly pageSelectorLabel: string;
  readonly artboardsHeading: string;
  readonly layersHeading: string;
  readonly inspectorHeading: string;
  readonly filterLayersPlaceholder: string;
  readonly noMatchingLayers: string;
  readonly noLayers: string;
  readonly canvasView: string;
  readonly previewView: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly zoomFit: string;
  readonly zoomActual: string;
  readonly toggleLayers: string;
  readonly toggleInspector: string;
  readonly documentOverview: string;
  readonly formatLabel: string;
  readonly versionLabel: string;
  readonly pagesLabel: string;
  readonly artboardsLabel: string;
  readonly layersLabel: string;
  readonly textLayersLabel: string;
  readonly imagesLabel: string;
  readonly fontsLabel: string;
  readonly exportedAtLabel: string;
  readonly selectionSection: string;
  readonly geometrySection: string;
  readonly typographySection: string;
  readonly appearanceSection: string;
  readonly textContentLabel: string;
  readonly copyText: string;
  readonly copyCss: string;
  readonly copied: string;
  readonly typeLabel: string;
  readonly visibilityLabel: string;
  readonly visibleYes: string;
  readonly visibleNo: string;
  readonly opacityLabel: string;
  readonly rotationLabel: string;
  readonly cornerRadiusLabel: string;
  readonly fontLabel: string;
  readonly fontSizeLabel: string;
  readonly lineHeightLabel: string;
  readonly alignLabel: string;
  readonly fillsLabel: string;
  readonly strokesLabel: string;
  readonly noFills: string;
  readonly noStrokes: string;
  readonly hiddenLayerBadge: string;
  readonly allArtboards: string;
  readonly canvasAriaLabel: string;
  readonly previewAlt: string;
  readonly imageFill: string;
  readonly gradientFill: string;
};

const EN: DesignMessages = {
  loadingReading: "Reading design file…",
  loadingParsing: "Parsing artboards and layers…",
  loadingRendering: "Rendering canvas…",
  invalidFile: "This file is not a valid Figma (.fig) or Sketch (.sketch) document.",
  resourceLimit: "This design file exceeds the safe memory or complexity limit for browser preview.",
  openFailed: "Could not open this design file.",
  pageSelectorLabel: "Select page",
  artboardsHeading: "Artboards",
  layersHeading: "Layers",
  inspectorHeading: "Inspector",
  filterLayersPlaceholder: "Filter layers or text…",
  noMatchingLayers: "No matching layers",
  noLayers: "No layers on this page",
  canvasView: "Canvas",
  previewView: "Preview",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomFit: "Fit",
  zoomActual: "100%",
  toggleLayers: "Layers",
  toggleInspector: "Inspector",
  documentOverview: "Document",
  formatLabel: "Format",
  versionLabel: "Version",
  pagesLabel: "Pages",
  artboardsLabel: "Artboards",
  layersLabel: "Layers",
  textLayersLabel: "Text layers",
  imagesLabel: "Embedded images",
  fontsLabel: "Fonts",
  exportedAtLabel: "Exported",
  selectionSection: "Layer",
  geometrySection: "Position & Size",
  typographySection: "Typography",
  appearanceSection: "Fills & Strokes",
  textContentLabel: "Text Content",
  copyText: "Copy text",
  copyCss: "Copy CSS",
  copied: "Copied",
  typeLabel: "Type",
  visibilityLabel: "Visibility",
  visibleYes: "Visible",
  visibleNo: "Hidden",
  opacityLabel: "Opacity",
  rotationLabel: "Rotation",
  cornerRadiusLabel: "Radius",
  fontLabel: "Font",
  fontSizeLabel: "Size",
  lineHeightLabel: "Line height",
  alignLabel: "Align",
  fillsLabel: "Fills",
  strokesLabel: "Strokes",
  noFills: "None",
  noStrokes: "None",
  hiddenLayerBadge: "Hidden",
  allArtboards: "Entire Page",
  canvasAriaLabel: "Design canvas viewport",
  previewAlt: "Embedded design preview thumbnail",
  imageFill: "Image",
  gradientFill: "Gradient",
};

const ZH_CN: DesignMessages = {
  loadingReading: "正在读取设计文件…",
  loadingParsing: "正在解析画板与图层…",
  loadingRendering: "正在渲染画布…",
  invalidFile: "该文件不是有效的 Figma（.fig）或 Sketch（.sketch）设计文档。",
  resourceLimit: "该设计文件超出浏览器安全解析的体积或复杂度上限。",
  openFailed: "无法打开此设计文件。",
  pageSelectorLabel: "选择页面",
  artboardsHeading: "画板",
  layersHeading: "图层",
  inspectorHeading: "属性检查",
  filterLayersPlaceholder: "筛选图层或文字…",
  noMatchingLayers: "无匹配图层",
  noLayers: "当前页面没有图层",
  canvasView: "画布",
  previewView: "内置预览图",
  zoomIn: "放大",
  zoomOut: "缩小",
  zoomFit: "适应",
  zoomActual: "100%",
  toggleLayers: "图层",
  toggleInspector: "属性",
  documentOverview: "文档信息",
  formatLabel: "格式",
  versionLabel: "版本",
  pagesLabel: "页面数",
  artboardsLabel: "画板数",
  layersLabel: "图层数",
  textLayersLabel: "文字图层",
  imagesLabel: "内置图片",
  fontsLabel: "使用字体",
  exportedAtLabel: "导出时间",
  selectionSection: "图层",
  geometrySection: "位置与尺寸",
  typographySection: "文字样式",
  appearanceSection: "填充与描边",
  textContentLabel: "文字内容",
  copyText: "复制文字",
  copyCss: "复制 CSS",
  copied: "已复制",
  typeLabel: "类型",
  visibilityLabel: "可见性",
  visibleYes: "可见",
  visibleNo: "隐藏",
  opacityLabel: "不透明度",
  rotationLabel: "旋转",
  cornerRadiusLabel: "圆角",
  fontLabel: "字体",
  fontSizeLabel: "字号",
  lineHeightLabel: "行高",
  alignLabel: "对齐",
  fillsLabel: "填充",
  strokesLabel: "描边",
  noFills: "无",
  noStrokes: "无",
  hiddenLayerBadge: "隐藏",
  allArtboards: "整页视图",
  canvasAriaLabel: "设计稿画布视口",
  previewAlt: "设计稿内置预览缩略图",
  imageFill: "图片填充",
  gradientFill: "渐变填充",
};

const MESSAGES: Partial<Record<Locale, DesignMessages>> = {
  en: EN,
  "zh-CN": ZH_CN,
};

export function getMessages(locale: Locale): DesignMessages {
  return MESSAGES[locale] ?? EN;
}
