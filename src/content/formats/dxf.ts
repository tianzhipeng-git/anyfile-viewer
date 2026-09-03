import { defineFormat } from "./define-format";

export const dxfFormat = defineFormat("dxf", "engineering", 3,
  {
    name: "DXF CAD drawing",
    title: "Open DXF Engineering Drawings Online",
    description: "View 2D DXF engineering drawings locally without uploading the file.",
    introduction: "DXF is the widely used AutoCAD Drawing Exchange Format for 2D vector engineering drawings. Anyfile parses common lines, polylines, circles, arcs, ellipses, text and blocks, then renders them on a zoomable local canvas.",
    canShow: ["Lines, polylines, circles, arcs and ellipses", "Text, blocks and layer colors", "Pan, zoom, rotate and fit controls"],
    limitations: ["DXF binary files are not rendered", "Hatches, dimensions and advanced styling are simplified", "DWG native drawings are not included in this viewer"],
    faq: [{
      question: "Can Anyfile open DWG files?",
      answer: "Not in this viewer. DXF is the open interchange form of CAD drawings, while DWG requires a separate proprietary parser.",
    }],
  },
  {
    name: "DXF 工程图",
    title: "在线打开 DXF 工程图",
    description: "不上传文件，在本地查看 2D DXF 工程图。",
    introduction: "DXF 是 AutoCAD 广泛使用的 Drawing Exchange Format，用于保存 2D 矢量工程图。Anyfile 解析常见直线、多段线、圆、圆弧、椭圆、文字与图块，并在可缩放画布中本地渲染。",
    canShow: ["直线、多段线、圆、圆弧与椭圆", "文字、图块与图层颜色", "平移、缩放、旋转与适合窗口控件"],
    limitations: ["不渲染二进制 DXF", "剖面线、标注和高级样式会被简化", "此查看器不包含原生 DWG 图档"],
    faq: [{
      question: "Anyfile 能打开 DWG 文件吗？",
      answer: "当前查看器不能。DXF 是 CAD 图档的开放交换格式，而 DWG 需要独立的专有解析器。",
    }],
  },
  {
    possibleLevels: [3],
    conditions: {
      en: ["ASCII DXF files with supported 2D entities", "Binary DXF is not currently supported"],
      "zh-CN": ["受支持 2D 图元的 ASCII DXF 文件", "二进制 DXF 暂不支持"],
    },
    verification: "verified",
  },
);
