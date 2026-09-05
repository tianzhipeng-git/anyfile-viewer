import { defineFormat } from "./define-format";
export const cadExchangeFormats = ["step", "stp", "iges", "igs", "brep"].map(extension => defineFormat(extension, "engineering", 3, {
  name: extension.toUpperCase(), title: `View ${extension.toUpperCase()} CAD Files Online`, description: `Inspect tessellated ${extension.toUpperCase()} geometry locally without uploading files.`,
  introduction: `${extension.toUpperCase()} shapes are tessellated locally in a cancellable Worker and displayed with face colors and assembly names.`,
  canShow: ["Solid surfaces and face boundaries", "Standard views, orbit, zoom and visibility"], limitations: ["16 MiB input; WebGL 2 and WebAssembly required", "No PMI, exact measurement or editing; BREP units are unknown"],
  faq: [{ question: `Are ${extension.toUpperCase()} models uploaded?`, answer: "No. Parsing and rendering stay in your browser." }],
}, {
  name: extension.toUpperCase(), title: `在线查看 ${extension.toUpperCase()} CAD 文件`, description: `无需上传文件，在本地查看离散化 ${extension.toUpperCase()} 几何。`,
  introduction: `${extension.toUpperCase()} 几何在可取消的 Worker 中本地离散化，显示面颜色与装配名称。`,
  canShow: ["实体曲面与面边界", "标准视图、旋转、缩放与显隐"], limitations: ["输入最大 16 MiB；需要 WebGL 2 与 WebAssembly", "不提供 PMI、精确测量或编辑；BREP 单位未知"],
  faq: [{ question: `${extension.toUpperCase()} 模型会上传吗？`, answer: "不会。解析和显示均在浏览器本地进行。" }],
}, { verification: "pending" }));
