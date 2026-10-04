import { defineFormat } from "./define-format";
export const sceneExchangeFormats = [
  defineFormat("fbx", "3d-models", 3, {
    name: "FBX scene", title: "FBX Viewer & 3D Scene Walkthroughs",
    description: "Open FBX models locally, inspect scene objects and explore building interiors in walkthrough mode.",
    introduction: "FBX carries scene geometry between modeling and animation applications. Anyfile opens supported ASCII and binary FBX files in your browser, preserving imported object transforms and basic materials. For architectural exports, place a viewpoint inside the model and look around rooms without installing the source application.",
    canShow: ["Supported mesh hierarchy, transforms, materials and animation clips", "Embedded or local PNG/JPEG textures; open the containing folder for external images", "Orbit, wireframe, object visibility and first-person walkthroughs", "Declared FBX length units converted to meters for eye height and movement"],
    limitations: ["ASCII FBX 7.0+ and binary FBX 6.4+; exporter-specific features may differ", "No editing, simulation or full reproduction of proprietary shaders, constraints and morph normals", "Missing or unsupported images leave geometry visible with a warning; remote textures are not fetched", "128 MiB input; parser arrays, decoded geometry and textures have separate budgets; parsing stops after 120 seconds"],
    faq: [
      { question: "Why does my FBX model have no textures?", answer: "FBX may reference separate image files. Open the export folder and preserve its relative paths. Supported PNG/JPEG images can also be embedded. Missing images and unsupported shader features can change the appearance." },
      { question: "Can I walk through an FBX interior?", answer: "Yes. Use Place viewpoint on a visible surface, then enter walkthrough mode. Drag to look around, use WASD and Q/E to move, and scroll or pinch to change field of view. Movement allows passing through walls." },
    ],
  }, {
    name: "FBX 场景", title: "FBX 在线查看器与三维场景漫游",
    description: "在本地打开 FBX 模型，检查场景对象和材质，进入建筑内部第一人称漫游，无需上传文件。",
    introduction: "FBX 用于在建模与动画软件之间交换场景几何。Anyfile 在浏览器中打开受支持的 ASCII 和二进制 FBX，保留导入对象的变换与基础材质。对于建筑导出场景，可以将观察点放进模型内部，在无需安装原软件的情况下环顾房间。",
    canShow: ["受支持的网格层级、变换、材质与动画片段", "内嵌或本地 PNG/JPEG 纹理；外部图片需打开所在文件夹", "旋转、线框、对象显隐与第一人称漫游", "根据声明的 FBX 长度单位转换为米，用于眼高和移动"],
    limitations: ["支持 ASCII FBX 7.0 及以上、二进制 FBX 6.4 及以上；不同导出器的特性可能存在差异", "不提供编辑、模拟或专有着色器、约束及形态法线的完整还原", "缺失或不支持的纹理会显示提示，几何仍可查看；不下载远程纹理", "输入最多 128 MiB；解析数组、几何和纹理各有独立预算；解析最多 120 秒"],
    faq: [
      { question: "为什么 FBX 模型没有纹理？", answer: "FBX 可能引用独立图片。请打开导出文件夹并保留相对路径。也支持内嵌 PNG/JPEG。缺图和不支持的着色器特性都可能导致外观变化。" },
      { question: "可以进入 FBX 室内场景漫游吗？", answer: "可以。在可见表面放置观察点后进入漫游。拖动环顾，用 WASD 和 Q/E 移动，滚轮或触摸板捏合调整视野。当前允许穿墙。" },
    ],
  }, { verification: "pending" }),
  defineFormat("dae", "3d-models", 3, {
    name: "COLLADA DAE", title: "COLLADA DAE Viewer & Room Walkthroughs",
    description: "Preview COLLADA DAE scenes with local textures and explore architectural models from inside a room.",
    introduction: "COLLADA stores a 3D scene in an XML-based .dae file, often accompanied by a folder of images. It is useful for exchanging architecture and interior models between applications. Anyfile reads supported scene geometry locally and offers exterior inspection or a first-person view inside the building.",
    canShow: ["Supported COLLADA meshes, scene nodes, transforms and animation clips", "Basic materials and PNG/JPEG textures from the authorized model folder", "Declared units and X-, Y- or Z-up axes normalized to meters and Y-up", "Viewpoint placement, room walkthroughs, adjustable eye height and field of view"],
    limitations: ["COLLADA support is a subset: advanced effects, physics, kinematics and external scene documents are not exposed", "Missing textures produce a geometry preview with a warning; remote resources are blocked", "No collision detection, gravity, editing or exact measurements", "128 MiB input, with separate structure, geometry and image limits; parsing stops after 120 seconds"],
    faq: [
      { question: "How should I open a DAE exported from SketchUp?", answer: "Open the folder containing the DAE and its texture images, keeping their relative paths. The viewer uses the units and up axis declared in the file. Results depend on the geometry and material features used by the exporter." },
      { question: "Does DAE need to be converted before a walkthrough?", answer: "No. Open a supported DAE directly, select a visible surface with Place viewpoint, and enter the room. Return to overview restores your previous camera view." },
    ],
  }, {
    name: "COLLADA DAE", title: "DAE 在线查看器：COLLADA 模型与室内漫游",
    description: "预览 COLLADA DAE 场景及本地纹理，从房间内部查看建筑模型，无需上传或先转换文件。",
    introduction: "COLLADA 使用基于 XML 的 .dae 文件保存三维场景，通常配有纹理图片文件夹，适合在不同应用之间交换建筑和室内模型。Anyfile 在本地读取受支持的场景几何，可从外部检查建筑，也能进入内部使用第一人称视角观察。",
    canShow: ["受支持的 COLLADA 网格、场景节点、变换与动画片段", "基础材质与授权模型文件夹内的 PNG/JPEG 纹理", "根据声明的单位及 X、Y、Z 向上坐标系，统一为米和 Y 向上", "观察点放置、室内漫游、眼高调节与视野角度调整"],
    limitations: ["支持 COLLADA 子集，不展示高级特效、物理、运动学或外部场景文档", "缺图时保留几何预览并提示；阻止远程资源请求", "不提供碰撞检测、重力、编辑或精确测量", "输入最多 128 MiB，结构、几何和图片分别受资源预算约束；解析最多 120 秒"],
    faq: [
      { question: "如何打开 SketchUp 导出的 DAE？", answer: "打开包含 DAE 与纹理图片的文件夹，保留相对路径。查看器使用文件声明的单位和向上坐标轴，具体显示效果取决于导出器使用的几何与材质特性。" },
      { question: "DAE 必须转换后才能漫游吗？", answer: "不需要。直接打开受支持的 DAE，使用放置观察点选择可见表面后进入房间。返回总览会恢复之前的观察视角。" },
    ],
  }, { verification: "pending" }),
];
