import { defineFormat } from "./define-format";

export const meshFormats = [
  defineFormat("3mf", "3d-models", 3, {
    name: "3MF print model", title: "Inspect 3MF Print Models Online",
    description: "View 3MF build items, component placement and model units before opening the project in a slicer.",
    introduction: "3MF is a ZIP-based manufacturing package containing an XML model and package relationships. Unlike a bare STL triangle list, it can describe reusable components and their placement in a build. Anyfile follows the package's model relationship and displays supported mesh objects in their build positions.",
    canShow: ["Triangle meshes, named components and build-item transforms", "Declared model units and supported object-level base colors", "Orbit and object visibility for inspecting the arrangement of printable parts"],
    limitations: ["No slicing, toolpaths, support generation or printability validation", "Textures, per-face material properties and advanced 3MF extensions are not reproduced", "64 MiB input and total expanded package budget, 32 MiB per entry; WebGL 2 required"],
    faq: [
      { question: "Does opening 3MF also load my slicer settings?", answer: "The viewer focuses on the model and build geometry. Application-specific print profiles, plate settings and generated toolpaths are not interpreted as a slicing project." },
      { question: "Why keep 3MF instead of exporting STL for preview?", answer: "A supported 3MF package can retain component placement and explicit units that a basic STL does not describe. Converting to STL can discard that context." },
    ],
  }, {
    name: "3MF 打印模型", title: "在线检查 3MF 打印模型",
    description: "在切片软件中打开项目前，查看受支持的 3MF 构建项、部件变换与模型单位。",
    introduction: "3MF 是基于 ZIP 的制造数据包，包含 XML 模型及包关系。它与单纯的 STL 三角面清单不同，可以描述可复用部件及其在构建中的位置。Anyfile 根据包内模型关系找到入口，将受支持的网格对象放置到对应构建位置显示。",
    canShow: ["三角网格、命名部件与构建项变换", "声明的模型单位及受支持的对象级基础颜色", "通过旋转和对象显隐检查待打印零件的摆放"],
    limitations: ["不提供切片、刀路、支撑生成或可打印性验证", "不复现纹理、逐面材质属性和高级 3MF 扩展", "输入及包总展开量最多 64 MiB，单条目 32 MiB；需要 WebGL 2"],
    faq: [
      { question: "打开 3MF 会一并加载切片软件设置吗？", answer: "查看器侧重模型与构建几何，不会将应用专属的打印配置、打印板设置或生成刀路解释为切片项目。" },
      { question: "预览时为什么可以保留 3MF 而不导出 STL？", answer: "受支持的 3MF 包可以保留基础 STL 不描述的部件位置与明确单位。转换为 STL 可能丢失这些信息。" },
    ],
  }, { verification: "pending" }),
  defineFormat("amf", "3d-models", 3, {
    name: "AMF additive manufacturing model", title: "View Uncompressed AMF Models Online",
    description: "Inspect AMF XML objects and triangle volumes with declared units and supported material colors.",
    introduction: "Additive Manufacturing File Format describes objects, vertices and volumes in XML. Anyfile reads uncompressed AMF, groups triangles by volume and uses supported object, volume or material colors. This is a geometric preview of the manufacturing model rather than a printer job processor.",
    canShow: ["Object meshes containing vertex coordinates and triangle volumes", "Supported volume/material colors and the XML model's length unit", "Separate visible objects for checking a multi-volume model"],
    limitations: ["Compressed AMF input, constellations, curved triangles and texture features are outside the supported subset", "The preview does not validate material mixtures, manufacturing constraints or mesh repair", "XML input up to 64 MiB; geometry budgets also apply; requires WebGL 2"],
    faq: [
      { question: "Why does an AMF with a constellation fail?", answer: "Constellations arrange reusable instances, but the current AMF reader handles explicit object meshes and rejects constellation entries. Export a copy with supported explicit geometry in the source tool." },
      { question: "Is AMF interpreted as a 3MF package?", answer: "No. This path expects an uncompressed XML document with an amf root. 3MF uses a separate package structure and reader; changing extensions will not convert between them." },
    ],
  }, {
    name: "AMF 增材制造模型", title: "在线查看未压缩的 AMF 模型",
    description: "检查 AMF XML 对象和三角体积，显示声明单位及受支持的材质颜色。",
    introduction: "Additive Manufacturing File Format 使用 XML 描述对象、顶点和体积。Anyfile 读取未压缩 AMF，按体积组织三角面，并使用受支持的对象、体积或材质颜色。这里提供制造模型的几何预览，不执行打印任务。",
    canShow: ["包含顶点坐标和三角体积的对象网格", "受支持的体积与材质颜色，以及 XML 声明的长度单位", "通过独立对象显隐检查多体积模型"],
    limitations: ["压缩 AMF、constellation 实例组合、曲面三角形和纹理特性不在支持子集内", "不验证材料混合、制造约束或进行网格修复", "XML 输入最大 64 MiB，另有几何数量预算；需要 WebGL 2"],
    faq: [
      { question: "为什么包含 constellation 的 AMF 会失败？", answer: "Constellation 用于排列可复用实例，但当前 AMF 读取器只处理显式对象网格并拒绝此类条目。请在源工具中导出包含受支持显式几何的副本。" },
      { question: "AMF 会按 3MF 数据包解析吗？", answer: "不会。此路径要求根元素为 amf 的未压缩 XML 文档。3MF 使用另一种包结构及读取器，改扩展名不能实现转换。" },
    ],
  }, { verification: "pending" }),
  defineFormat("stl", "3d-models", 3, {
    name: "STL triangle mesh", title: "View ASCII and Binary STL Files Online",
    description: "Inspect ASCII or binary STL triangle surfaces with rotation and zoom.",
    introduction: "STL describes a surface as triangles and is frequently exchanged for 3D printing. It does not provide the editable CAD features of the source design. Anyfile parses ASCII or binary triangles and displays a shaded mesh, allowing a quick visual check of the exported shape.",
    canShow: ["Supported ASCII facet data and binary triangle records", "A shaded surface with recalculated normals", "Standard orientations and zoom for checking the model silhouette"],
    limitations: ["No reliable length unit, texture, material or source part hierarchy is inferred from STL", "A visible surface is not proof of watertightness or printability; no repair or slicing is performed", "64 MiB input plus triangle-count budgets; WebGL 2 required"],
    faq: [
      { question: "Why is my STL shown in one color?", answer: "This viewer renders the triangle geometry with a uniform material. Vendor-specific binary color conventions are not used to reproduce the original appearance." },
      { question: "Can STL preview tell whether the model is in inches or millimeters?", answer: "No. STL does not supply a standard explicit length unit. Confirm the export setting in the source application before choosing units in a slicer." },
    ],
  }, {
    name: "STL 三角网格", title: "在线查看 ASCII 与二进制 STL 文件",
    description: "通过旋转和缩放检查 STL 三角曲面，支持 ASCII 面片与二进制记录。",
    introduction: "STL 用三角形描述表面，常用于交换 3D 打印模型。它不提供源设计中可编辑的 CAD 特征。Anyfile 解析 ASCII 或二进制三角面并显示着色网格，方便快速检查导出后的外形。",
    canShow: ["受支持的 ASCII 面片数据与二进制三角记录", "重新计算法线后的着色表面", "用于检查轮廓的标准朝向和缩放"],
    limitations: ["不从 STL 推断可靠的长度单位、纹理、材质或源部件层级", "表面可见不代表水密或可打印，不执行修复和切片", "输入最多 64 MiB，另有三角形数量预算；需要 WebGL 2"],
    faq: [
      { question: "为什么 STL 只显示一种颜色？", answer: "此查看器使用统一材质显示三角几何，不根据厂商特有的二进制颜色约定还原原始外观。" },
      { question: "STL 预览能判断模型是英寸还是毫米吗？", answer: "不能。STL 没有标准的明确长度单位字段。请先核对源软件的导出设置，再在切片软件中选择单位。" },
    ],
  }, { verification: "pending" }),
  defineFormat("obj", "3d-models", 3, {
    name: "Wavefront OBJ", title: "View OBJ Models with Local MTL Materials",
    description: "View OBJ geometry and supported MTL diffuse textures by opening the model folder.",
    introduction: "OBJ stores text-based geometry while appearance can live in a separate MTL library and image files. Selecting only the OBJ may therefore show the shape without its materials. Anyfile resolves supported companion resources from the selected local folder and does not fetch textures from remote URLs.",
    canShow: ["Mesh objects described by OBJ vertices and faces", "Supported MTL material values and simple local map_Kd diffuse images", "Object visibility and a navigable 3D view of the assembled mesh"],
    limitations: ["Missing companion files can leave geometry visible with incomplete appearance", "Advanced texture-map options, bump/normal maps and some MTL features are not reproduced", "64 MiB OBJ input, 1 MiB per MTL and a 128 MiB related-resource budget; WebGL 2 required"],
    faq: [
      { question: "How do I restore missing textures on an OBJ?", answer: "Open the containing folder with the OBJ, its referenced MTL and image files, preserving relative paths. Only supported local maps can appear; a remote URL is not downloaded by the viewer." },
      { question: "Can an OBJ alone contain all of its texture images?", answer: "The usual OBJ/MTL workflow references separate images. Sending only the OBJ often loses appearance information even though the geometry remains readable." },
    ],
  }, {
    name: "Wavefront OBJ", title: "查看 OBJ 模型与本地 MTL 材质",
    description: "打开模型所在文件夹，检查 Wavefront 几何及受支持的 MTL 漫反射纹理。",
    introduction: "OBJ 以文本保存几何，外观则可能位于独立 MTL 材质库和图片中。因此只选择 OBJ 可能看到形状却缺少材质。Anyfile 从所选本地文件夹解析受支持的关联资源，不从远程 URL 下载纹理。",
    canShow: ["由 OBJ 顶点和面描述的网格对象", "受支持的 MTL 材质数值与简单本地 map_Kd 漫反射图片", "对象显隐，以及可交互浏览的组合网格"],
    limitations: ["缺少关联文件时，几何仍可能可见，但外观不完整", "不复现高级纹理参数、凹凸/法线贴图及部分 MTL 特性", "OBJ 输入 64 MiB，单个 MTL 1 MiB，关联资源总预算 128 MiB；需要 WebGL 2"],
    faq: [
      { question: "如何恢复 OBJ 缺失的纹理？", answer: "打开包含 OBJ、所引用 MTL 和图片的文件夹，并保留相对路径。只有受支持的本地贴图能够显示，查看器不会下载远程 URL。" },
      { question: "单个 OBJ 能包含全部纹理图片吗？", answer: "常见 OBJ/MTL 工作流会引用独立图片。只发送 OBJ 通常会丢失外观信息，即使几何仍然可读。" },
    ],
  }, { verification: "pending" }),
  defineFormat("ply", "3d-models", 3, {
    name: "PLY polygon or point data", title: "View PLY Meshes and Point Sets Online",
    description: "Open ASCII or binary PLY as a surface mesh, or as points when no face records are present.",
    introduction: "PLY describes elements and properties in a header followed by ASCII or binary records. It is used for polygon surfaces and scanned point sets. Anyfile reads supported vertex data and chooses a surface or point display based on whether the file declares faces, retaining recognized vertex colors.",
    canShow: ["Polygon geometry rendered as a shaded surface when face elements are present", "Vertex-only datasets displayed as points", "Recognized vertex colors in supported ASCII or binary PLY files"],
    limitations: ["Custom PLY properties are not exposed as an attribute table", "No surface reconstruction from point-only data or mesh repair", "64 MiB input and element-count budgets; this path does not stream very large clouds like the LAS preview; WebGL 2 required"],
    faq: [
      { question: "Why does my PLY show dots instead of a solid surface?", answer: "A vertex-only PLY has positions but no face connectivity. The viewer draws those points and does not invent triangles. Export a mesh with faces if a surface is required." },
      { question: "Does PLY use the same preview as LAS?", answer: "No. PLY is loaded as a bounded mesh or vertex dataset. LAS uses a separate streamed point sampler with different size limits and attribute support." },
    ],
  }, {
    name: "PLY 多边形或点数据", title: "在线查看 PLY 网格与点集",
    description: "打开 ASCII 或二进制 PLY 几何，有面记录时显示网格，只有顶点时显示点。",
    introduction: "PLY 在头部声明元素与属性，再保存 ASCII 或二进制记录，可用于多边形表面和扫描点集。Anyfile 读取受支持的顶点数据，根据文件是否声明面选择曲面或点显示，并保留可识别的顶点颜色。",
    canShow: ["存在面元素时，以着色表面显示多边形几何", "仅含顶点的数据集显示为点", "受支持 ASCII 或二进制 PLY 中可识别的顶点颜色"],
    limitations: ["不会将自定义 PLY 属性展示为属性表", "不从纯点数据重建曲面，也不修复网格", "输入最多 64 MiB，另有元素数量预算；此路径不像 LAS 预览那样流式处理超大点云；需要 WebGL 2"],
    faq: [
      { question: "为什么 PLY 显示为点而不是实体表面？", answer: "只有顶点的 PLY 包含位置，却没有面的连接关系。查看器显示这些点，不会自行创造三角面。需要表面时请导出包含面的网格。" },
      { question: "PLY 与 LAS 使用相同的预览方式吗？", answer: "不是。PLY 作为有大小限制的网格或顶点数据集加载；LAS 使用独立的流式点抽样器，大小限制和属性支持不同。" },
    ],
  }, { verification: "pending" }),
  defineFormat("off", "3d-models", 3, {
    name: "OFF polygon mesh", title: "Inspect Basic OFF Polygon Meshes Online",
    description: "Inspect plain OFF vertex coordinates and indexed polygon faces as a shaded mesh.",
    introduction: "Object File Format begins with OFF, followed by element counts, vertex coordinates and face indices. It is a compact way to exchange polygon connectivity without a material package. Anyfile triangulates supported faces for display and calculates normals for the shaded surface.",
    canShow: ["Plain OFF vertex positions and indexed polygon faces", "Triangulated surface geometry with rotation and standard views"],
    limitations: ["Colored or normal-bearing variants such as COFF and NOFF, and extra attribute records, are not supported", "Simple fan triangulation can misrepresent concave polygons; triangulate them in the source tool for a reliable preview", "64 MiB input with vertex/face limits; no texture loading or topology repair; WebGL 2 required"],
    faq: [
      { question: "Why is my COFF file rejected by the OFF viewer?", answer: "COFF includes color attributes and a different header. This parser expects plain OFF structure and rejects extra attributes rather than treating them as coordinates or face indices." },
      { question: "Why can a concave OFF face look incorrect?", answer: "The preview splits each polygon into a fan of triangles. This simple construction is suited to convex faces; complex concave faces should be triangulated before export." },
    ],
  }, {
    name: "OFF 多边形网格", title: "在线检查基础 OFF 多边形网格",
    description: "读取包含顶点坐标和索引多边形面的普通 OFF 网格，检查其着色几何。",
    introduction: "Object File Format 以 OFF 开头，之后保存元素数量、顶点坐标和面索引。它用于紧凑地交换多边形连接关系，不需要材质包。Anyfile 将受支持的面三角化并计算法线，以着色表面显示。",
    canShow: ["普通 OFF 顶点位置与索引多边形面", "三角化表面几何，以及旋转和标准视图"],
    limitations: ["不支持 COFF、NOFF 等颜色或法线变体，也不支持额外属性记录", "简单扇形三角化可能错误显示凹多边形；请在源工具中先三角化以获得可靠预览", "输入 64 MiB，另有顶点与面数量限制；不加载纹理或修复拓扑；需要 WebGL 2"],
    faq: [
      { question: "为什么 OFF 查看器拒绝 COFF 文件？", answer: "COFF 有颜色属性及不同文件头。当前解析器要求普通 OFF 结构，会拒绝额外属性，避免将它们当作坐标或面索引。" },
      { question: "为什么 OFF 的凹面可能显示不正确？", answer: "预览将每个多边形拆成扇形三角面。这种简单构造适用于凸面，复杂凹面应在导出前先完成三角化。" },
    ],
  }, { verification: "pending" }),
  defineFormat("gltf", "3d-models", 3, {
    name: "glTF 2.0 scene", title: "Open glTF Scenes with Local Resources",
    description: "View a glTF 2.0 scene with its local binary buffers and images by selecting the containing folder.",
    introduction: "A .gltf file is the JSON description of a scene: nodes, meshes and materials can reference separate buffers and textures. Keep the export folder intact when opening it in Anyfile. The viewer resolves supported local dependencies and displays the scene without using remote resource URLs.",
    canShow: ["Supported glTF 2.0 scene nodes, meshes and materials", "Local buffer data and supported image textures from the selected workspace", "Scene navigation and object visibility with glTF's meter-based scale"],
    limitations: ["Missing binary buffers can prevent opening; missing images can leave geometry visible without some textures", "Required Draco, meshopt and BasisU compression extensions cannot be decoded", "64 MiB model input and 128 MiB related-resource budget; WebGL 2 required"],
    faq: [
      { question: "Why does selecting only the glTF JSON fail?", answer: "The scene may reference a .bin buffer that contains the actual vertex data. Select its folder with the companion files and preserve relative paths so the reader can find them." },
      { question: "Will remote glTF textures be downloaded?", answer: "No. This viewer resolves local or supported embedded resources. Export the dependencies into a local folder if the scene originally points to network resources." },
    ],
  }, {
    name: "glTF 2.0 场景", title: "打开 glTF 场景及本地关联资源",
    description: "选择所在文件夹，一起查看 glTF 2.0 场景及其本地二进制缓冲区和图片。",
    introduction: ".gltf 文件是场景的 JSON 描述，节点、网格和材质可以引用独立的缓冲区与纹理。使用 Anyfile 打开时请保留完整导出文件夹，查看器会解析受支持的本地依赖，不使用远程资源 URL。",
    canShow: ["受支持的 glTF 2.0 场景节点、网格与材质", "所选工作区中的本地缓冲数据与受支持图片纹理", "场景导航与对象显隐，采用 glTF 以米为基础的尺度"],
    limitations: ["缺少二进制缓冲区可能无法打开；缺图时几何仍可能可见，但部分纹理缺失", "无法解码必需的 Draco、meshopt 或 BasisU 压缩扩展", "模型输入最多 64 MiB，关联资源预算 128 MiB；需要 WebGL 2"],
    faq: [
      { question: "为什么只选择 glTF JSON 会失败？", answer: "场景可能引用包含实际顶点数据的 .bin 缓冲区。请选择包含关联文件的文件夹并保留相对路径，使读取器能找到它们。" },
      { question: "会下载 glTF 引用的远程纹理吗？", answer: "不会。此查看器解析本地或受支持的内嵌资源。如果场景原本指向网络资源，请将依赖导出到本地文件夹后再打开。" },
    ],
  }, { verification: "pending" }),
  defineFormat("glb", "3d-models", 3, {
    name: "Binary glTF 2.0", title: "View GLB Binary glTF Models Online",
    description: "Inspect GLB scenes with packaged geometry and supported textures before using them in a 3D application.",
    introduction: "GLB wraps a glTF scene in a binary container with a JSON chunk and, commonly, an embedded binary buffer. This can make a model easier to share as one file than a multi-file .gltf export. Anyfile reads supported glTF 2.0 content from that container and opens its scene in the local viewport.",
    canShow: ["Scene hierarchy and meshes stored in a supported GLB container", "Embedded geometry and supported materials or images", "Interactive inspection of the asset's shape and object arrangement"],
    limitations: ["A GLB can still reference external resources; those require the containing folder", "Bundling in GLB does not remove required Draco, meshopt or BasisU decoder dependencies, which are unsupported", "Input limited to 64 MiB; related files have a separate 128 MiB budget; requires WebGL 2"],
    faq: [
      { question: "Is every GLB completely self-contained?", answer: "No. GLB allows binary data to be embedded, but scene descriptions may still refer to external resources. If a companion file is required, open the folder containing both." },
      { question: "Why does a compressed GLB fail although another GLB opens?", answer: "GLB describes packaging, not a single mesh encoding. A file requiring Draco or meshopt geometry decoding, or BasisU textures, needs decoders that this viewer does not provide." },
    ],
  }, {
    name: "二进制 glTF 2.0", title: "在线查看 GLB 二进制 glTF 模型",
    description: "检查打包几何与受支持纹理的二进制 glTF 场景，在用于三维应用前核对资源。",
    introduction: "GLB 使用二进制容器包裹 glTF 场景，包含 JSON 块，并通常内嵌二进制缓冲区。相比多文件 .gltf 导出，它便于将模型作为单个文件分享。Anyfile 从容器中读取受支持的 glTF 2.0 内容，再在本地视口打开场景。",
    canShow: ["受支持 GLB 容器中的场景层级与网格", "内嵌几何及受支持的材质和图片", "交互检查资源的外形与对象排列"],
    limitations: ["GLB 仍可能引用外部资源，此时需打开所在文件夹", "打包为 GLB 不会消除必需的 Draco、meshopt 或 BasisU 解码依赖，当前不支持这些解码器", "输入上限 64 MiB，关联文件另有 128 MiB 预算；需要 WebGL 2"],
    faq: [
      { question: "每个 GLB 都完全自包含吗？", answer: "不是。GLB 允许内嵌二进制数据，但场景描述仍可能引用外部资源。需要关联文件时，请打开同时包含这些文件的文件夹。" },
      { question: "为什么压缩 GLB 失败，而另一个 GLB 能打开？", answer: "GLB 描述的是打包方式，不是单一网格编码。需要 Draco 或 meshopt 几何解码、或 BasisU 纹理解码的文件，依赖当前查看器未提供的解码器。" },
    ],
  }, { verification: "pending" }),
];
