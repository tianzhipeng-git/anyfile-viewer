import { defineFormat } from "./define-format";

export const cadExchangeFormats = [
  defineFormat("step", "engineering", 3, {
    name: "STEP / STP", title: "View STEP and STP CAD Files Online",
    description: "Inspect and rotate STEP or STP parts and assemblies, with supported component names and face colors.",
    introduction: "STEP exchanges product geometry between CAD systems. The supported text representation begins with ISO-10303-21; .stp is another extension for the same format. Anyfile converts imported shapes into display triangles so you can inspect a supplier's part or assembly without the original CAD application.",
    canShow: ["Tessellated solid and surface geometry with face boundaries", "Assembly hierarchy, component names and face colors when present in the imported model", "Standard views and component visibility; STEP units are converted to millimeters"],
    limitations: ["16 MiB input; WebGL 2 and WebAssembly required", "The preview does not expose PMI, feature history, exact measurements or manufacturing validation", "Surface appearance is an approximation of the CAD geometry, not an editable parametric model"],
    faq: [
      { question: "Is STP different from STEP?", answer: "The .stp and .step extensions refer to the same exchange format. You can open either here without renaming or converting the file." },
      { question: "Why does a STEP assembly have no feature tree?", answer: "An exchange file can describe parts and their geometry without the sketches and operations of the source design. The viewer displays imported components; it does not reconstruct modeling history." },
    ],
  }, {
    name: "STEP / STP", title: "在线查看 STEP 与 STP CAD 文件",
    description: "检查 STEP 零件与装配，显示受支持的面颜色和部件名称。.step 与 .stp 使用同一查看入口。",
    introduction: "STEP 用于在不同 CAD 系统间交换产品几何。受支持的文本表示以 ISO-10303-21 开头，.stp 是同一格式的另一种扩展名。Anyfile 将导入的几何转换为显示用三角面，便于在没有原设计软件时检查供应商提供的零件或装配。",
    canShow: ["离散化后的实体、曲面及面边界", "导入模型中存在的装配层级、部件名称与面颜色", "标准视图及部件显隐；STEP 长度单位转换为毫米"],
    limitations: ["输入最大 16 MiB；需要 WebGL 2 与 WebAssembly", "不展示 PMI、建模历史，不提供精确测量或制造验证", "曲面外观是 CAD 几何的近似预览，不是可编辑参数模型"],
    faq: [
      { question: "STP 与 STEP 有区别吗？", answer: ".stp 与 .step 是同一交换格式的扩展名写法，两种文件都可以直接在这里打开，无需改名或转换。" },
      { question: "为什么 STEP 装配没有建模特征树？", answer: "交换文件可以包含部件及其几何，而不包含源设计的草图与建模操作。查看器展示导入的部件，不重建原软件的建模历史。" },
    ],
  }, { verification: "pending" }, undefined, ["stp"]),
  defineFormat("iges", "engineering", 3, {
    name: "IGES / IGS", title: "View IGES and IGS Surfaces Online",
    description: "Preview IGES or IGS surfaces and inspect face boundaries in supported CAD exports.",
    introduction: "IGES is a CAD exchange format commonly encountered in surface and legacy engineering workflows. An export may contain separate surfaces rather than a closed solid. Anyfile imports supported geometry and draws its tessellated faces, helping you inspect the shape before returning to a CAD tool for repair.",
    canShow: ["Supported imported faces and their boundary lines", "An orbitable view of the surface model, including imported colors when available", "IGES geometry normalized to millimeters for display"],
    limitations: ["Curve-only files may have no renderable faces in this surface viewer", "Gaps between patches are not stitched or repaired; the preview does not certify a watertight solid", "Maximum input 16 MiB; requires WebGL 2 and WebAssembly; no exact measurement or PMI"],
    faq: [
      { question: "Can I open an IGS file on the IGES page?", answer: "Yes. IGS is the shorter extension for IGES, so both lead to this guide and the same import path." },
      { question: "Why does my IGES export look like separate surface patches?", answer: "The source can contain independent surfaces. A visible shell is not proof of a closed solid; sewing, gap checks and CAD repairs require a modeling tool." },
    ],
  }, {
    name: "IGES / IGS", title: "在线查看 IGES 与 IGS 曲面",
    description: "预览受支持的 IGES 曲面并检查可见边界，打开旧 CAD 工作流导出的 .iges 或 .igs 文件。",
    introduction: "IGES 常见于曲面交换与历史工程数据。导出的内容可能是一组独立曲面，而非封闭实体。Anyfile 导入受支持的几何并显示离散面，适合先检查外形，再回到 CAD 工具中进行修复。",
    canShow: ["受支持的导入曲面及其边界线", "旋转检查曲面模型，并显示可读取的颜色", "将 IGES 几何的长度单位统一为毫米进行显示"],
    limitations: ["只有曲线的文件可能没有可供此曲面查看器显示的面", "不缝合或修复曲面间隙，预览不代表模型已形成水密实体", "输入上限 16 MiB，要求 WebGL 2 和 WebAssembly；不提供精确测量或 PMI"],
    faq: [
      { question: "IGS 文件能在 IGES 页面打开吗？", answer: "可以。IGS 是 IGES 的短扩展名，两者使用同一份说明和导入流程。" },
      { question: "为什么 IGES 导出模型像许多分离的曲面片？", answer: "源文件可能保存的是独立曲面。看起来封闭的外壳不一定是有效实体，曲面缝合、间隙检测与几何修复仍需建模工具完成。" },
    ],
  }, { verification: "pending" }, undefined, ["igs"]),
  defineFormat("brep", "engineering", 3, {
    name: "Open CASCADE BREP", title: "Preview Open CASCADE BREP Shapes Online",
    description: "Inspect Open CASCADE BREP shapes as shaded geometry with face boundaries and an interactive view.",
    introduction: "Boundary representation describes geometry through faces, edges and their topology. This page handles Open CASCADE's BREP serialization, identified by DBRep_DrawableShape or CASCADE Topology text. It is not a universal reader for every CAD system that uses the term B-rep.",
    canShow: ["Display triangles generated from supported Open CASCADE faces", "Face boundary lines for checking the overall shape", "Rotation, zoom and standard orientations for local geometry inspection"],
    limitations: ["BREP length units are unknown to this viewer; displayed scale must not be used for dimensional decisions", "No source feature history, PMI, topology repair or exact geometric measurement", "Text BREP input is limited to 16 MiB and requires WebAssembly plus WebGL 2"],
    faq: [
      { question: "Can any boundary-representation model be renamed to BREP?", answer: "No. Boundary representation is a modeling concept, while this reader expects a specific Open CASCADE file structure. Renaming another CAD format does not convert it." },
      { question: "Why are BREP units not shown?", answer: "This import path does not supply a reliable length unit. Check the producing application or accompanying documentation rather than assuming millimeters." },
    ],
  }, {
    name: "Open CASCADE BREP", title: "在线预览 Open CASCADE BREP 几何",
    description: "以着色几何和面边界检查 Open CASCADE BREP 模型，无需启动完整 CAD 环境。",
    introduction: "边界表示通过面、边及其拓扑关系描述几何。本页读取的是 Open CASCADE 的 BREP 序列化文件，以 DBRep_DrawableShape 或 CASCADE Topology 文本识别，并非所有采用 B-rep 概念的 CAD 文件都能在此打开。",
    canShow: ["从受支持的 Open CASCADE 面生成的显示三角网格", "用于检查整体外形的面边界线", "通过旋转、缩放与标准朝向检查本地几何"],
    limitations: ["查看器无法确定 BREP 长度单位，不能依据显示比例作尺寸判断", "不提供源建模历史、PMI、拓扑修复或精确几何测量", "文本 BREP 输入最多 16 MiB，需要 WebAssembly 与 WebGL 2"],
    faq: [
      { question: "任意边界表示模型都能改名为 BREP 吗？", answer: "不能。边界表示是建模概念，而此读取器需要特定的 Open CASCADE 文件结构。修改扩展名不会转换其他 CAD 格式。" },
      { question: "为什么 BREP 不显示长度单位？", answer: "当前导入流程不提供可靠的长度单位。请根据生成软件或随附文档核对，不要直接假设是毫米。" },
    ],
  }, { verification: "pending" }),
];
