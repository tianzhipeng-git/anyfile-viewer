import { defineFormat } from "./define-format";
const formats = [
  ["3mf", "Build components, transforms and units", "构建部件、变换与单位"],
  ["amf", "Uncompressed XML meshes and units", "未压缩 XML 网格与单位"],
  ["stl", "ASCII and binary triangle meshes", "ASCII 与二进制三角网格"],
  ["obj", "Mesh objects and local MTL materials", "网格对象与本地 MTL 材质"],
  ["ply", "ASCII and binary meshes or points", "ASCII 与二进制网格或点"],
  ["off", "Basic polygon meshes", "基础多边形网格"],
  ["gltf", "glTF 2.0 scenes with local buffers and textures", "glTF 2.0 场景及本地 buffer 与纹理"],
  ["glb", "Binary glTF 2.0 scenes", "二进制 glTF 2.0 场景"],
];
export const meshFormats = formats.map(([extension, en, zh]) => defineFormat(extension, "engineering", 3, {
  name: extension.toUpperCase(), title: `Open ${extension.toUpperCase()} Models Online`,
  description: `View ${extension.toUpperCase()} geometry locally without uploading your model.`,
  introduction: `${extension.toUpperCase()}: ${en}. Models open in a local, interactive WebGL viewport.`,
  canShow: [en, "Standard views, orbit, zoom and object visibility"],
  limitations: ["64 MiB input limit; WebGL 2 required", "Advanced compression and some material features are not supported"],
  faq: [{ question: `Are my ${extension.toUpperCase()} files uploaded?`, answer: "No. Geometry and related resources stay in your browser. Select the containing folder for external resources." }],
}, {
  name: extension.toUpperCase(), title: `在线打开 ${extension.toUpperCase()} 模型`,
  description: `不上传模型，在本地查看 ${extension.toUpperCase()} 几何。`,
  introduction: `${extension.toUpperCase()}：${zh}。模型在本地 WebGL 视口中交互显示。`,
  canShow: [zh, "标准视图、旋转、缩放与对象显隐"],
  limitations: ["输入最大 64 MiB，需要 WebGL 2", "暂不支持高级压缩与部分材质特性"],
  faq: [{ question: `${extension.toUpperCase()} 文件会上传吗？`, answer: "不会。几何和关联资源留在浏览器中。涉及关联文件时请选择所在文件夹。" }],
}, { verification: "pending" }));
