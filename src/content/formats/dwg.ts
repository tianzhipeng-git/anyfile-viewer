import { defineFormat } from "./define-format";
export const dwgFormat = defineFormat("dwg", "engineering", 3,
  {
    name:"DWG CAD drawing", title:"Open DWG Drawings Online", description:"View DWG model-space drawings locally without uploading files.",
    introduction:"Anyfile reads DWG with a cancellable LibreDWG WebAssembly worker and renders common model-space geometry in an interactive viewport.",
    canShow:["Lines, arcs, circles, polylines, ellipses and spline curves", "Blocks, layer colors, text, cached dimensions and basic leaders", "Solid hatches and basic pattern fills, pan, zoom and layer visibility"],
    limitations:["16 MiB input, 512 MiB kernel heap and 30-second parsing budget", "Replacement fonts; text layout, dashed hatches and advanced annotations are approximate", "Paper-space layouts, external references, proxy objects and ACIS solids are excluded", "R13–2018 file signatures are recognized; individual objects may be omitted with a warning"],
    faq:[{question:"Are my drawings uploaded?",answer:"No. The drawing stays in your browser. Only the viewer and its WebAssembly runtime are downloaded."}],
  },
  {
    name:"DWG 工程图", title:"在线打开 DWG 图纸", description:"在浏览器本地查看 DWG 模型空间图纸，无需上传文件。",
    introduction:"Anyfile 使用可取消的 LibreDWG WebAssembly Worker 读取 DWG，在交互视口中展示常见模型空间几何。",
    canShow:["直线、圆弧、圆、多段线、椭圆和样条曲线", "图块、图层颜色、文字、缓存标注和基础引线", "实心填充、基础图案填充、平移、缩放与图层显隐"],
    limitations:["文件上限 16 MiB，内核堆 512 MiB，解析预算 30 秒", "使用替代字体；文字排版、虚线填充和高级注释为近似显示", "不包含图纸空间布局、外部参照、代理对象和 ACIS 实体", "识别 R13–2018 文件签名；部分对象可能省略并显示警告"],
    faq:[{question:"图纸会上传吗？",answer:"不会。图纸始终留在浏览器中，只下载查看器及其 WebAssembly 运行时。"}],
  },
  {possibleLevels:[3],conditions:{en:["Recognized DWG signatures containing supported model-space entities"],"zh-CN":["具有受支持模型空间图元的可识别 DWG 文件"]},verification:"pending"},
);
