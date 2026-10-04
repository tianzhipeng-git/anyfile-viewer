import { defineFormat } from "./define-format";
export const ifcFormat = defineFormat("ifc", "3d-models", 3, {
  name: "IFC", title: "IFC Building Viewer & Interior Walkthroughs",
  description: "Open IFC building models locally, inspect components and walk through interior spaces.",
  introduction: "IFC (Industry Foundation Classes) exchanges building information between BIM applications. Anyfile displays supported building geometry in your browser, so you can inspect the exterior or place a viewpoint inside a room without installing a BIM application or uploading the model.",
  canShow: ["Supported IFC2X3, IFC4 and IFC4X3_ADD2 geometry, component names, colors and transparency", "Orbit, standard views and visibility controls; models with over 256 components use type groups", "First-person walkthroughs with viewpoint placement, eye height and movement speed in meters", "Look around by dragging; use WASD and Q/E to move, and scrolling or trackpad pinch to adjust field of view"],
  limitations: ["STEP-text .ifc only; no IFCZIP or IFCXML", "Geometry preview only: no property tables, BIM validation, textures or exact measurements", "No collision, gravity or automatic floor detection; unsupported geometry may be omitted", "128 MiB input, 6 million vertices, 256 MiB geometry, 4,096 draw calls and 120 seconds parsing; WebGL 2 and WebAssembly required"],
  faq: [
    { question: "Can I walk inside an IFC building?", answer: "Yes. Place a viewpoint on a visible surface, set your eye height and enter walkthrough mode. You can move through walls and use Q/E to change elevation. Return to overview restores the previous exterior view." },
    { question: "Does opening IFC upload my building design?", answer: "No. File parsing and 3D rendering run locally in the browser. Public runtime assets may be downloaded, but the model is not uploaded." },
  ],
}, {
  name: "IFC", title: "IFC 在线查看器：建筑模型与室内漫游",
  description: "本地打开 IFC 建筑模型，检查构件并进入室内漫游，无需安装 BIM 软件或上传设计文件。",
  introduction: "IFC（Industry Foundation Classes）用于在 BIM 应用之间交换建筑信息。Anyfile 在浏览器中显示受支持的建筑几何，既可以从外部检查建筑，也可以将观察点放进房间内部，无需安装 BIM 软件或上传模型。",
  canShow: ["受支持的 IFC2X3、IFC4 和 IFC4X3_ADD2 几何、构件名称、颜色与透明度", "旋转、标准视图和显隐；超过 256 个构件时按构件类型分组", "第一人称漫游、观察点放置，以及以米为单位的眼高和移动速度", "拖动环顾，WASD 和 Q/E 移动，滚轮或触摸板捏合调整视野角度"],
  limitations: ["仅支持 STEP 文本 .ifc，不支持 IFCZIP 或 IFCXML", "提供几何预览，不含属性表、BIM 校验、纹理或精确测量", "无碰撞、重力或自动地板识别；不支持的几何可能被省略", "输入 128 MiB、600 万顶点、256 MiB 几何、4,096 次绘制及 120 秒解析上限；需要 WebGL 2 和 WebAssembly"],
  faq: [
    { question: "可以进入 IFC 建筑内部漫游吗？", answer: "可以。在可见表面放置观察点，设置眼高后进入漫游。可以穿过墙壁，用 Q/E 升降；返回总览会恢复之前的外部视角。" },
    { question: "打开 IFC 会上传建筑设计吗？", answer: "不会。文件解析和三维显示均在浏览器本地进行。可能下载公共运行时资源，但不会上传模型。" },
  ],
}, { verification: "pending" });
