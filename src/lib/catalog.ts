export type FileFormat = {
  extension: string;
  name: string;
  description: string;
  category: string;
  native: boolean;
};

export type FileCategory = {
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
  extensions: string[];
};

export const formats: FileFormat[] = [
  { extension: "png", name: "PNG 图片", description: "保留透明通道的无损位图格式。", category: "images-video", native: true },
  { extension: "jpg", name: "JPEG 图片", description: "适合照片与网页内容的通用图片格式。", category: "images-video", native: true },
  { extension: "svg", name: "SVG 矢量图", description: "可缩放、可检查源码的矢量图形。", category: "images-video", native: true },
  { extension: "mp4", name: "MP4 视频", description: "浏览器广泛支持的视频容器格式。", category: "images-video", native: true },
  { extension: "webm", name: "WebM 视频", description: "面向 Web 的开放视频格式。", category: "images-video", native: true },
  { extension: "pdf", name: "PDF 文档", description: "查看版式固定的文档与电子资料。", category: "documents", native: true },
  { extension: "docx", name: "Word 文档", description: "预览 Office Open XML 文字文档。", category: "documents", native: false },
  { extension: "xlsx", name: "Excel 表格", description: "查看工作表、数据与基础格式。", category: "documents", native: false },
  { extension: "md", name: "Markdown", description: "阅读纯文本标记与渲染结果。", category: "code-data", native: true },
  { extension: "json", name: "JSON 数据", description: "以数据表方式分页浏览 JSON 记录。", category: "code-data", native: false },
  { extension: "jsonl", name: "JSON Lines", description: "逐行解析并分页浏览 JSON 记录流。", category: "code-data", native: false },
  { extension: "csv", name: "CSV 数据", description: "自动识别列类型并以表格方式分页浏览。", category: "code-data", native: false },
  { extension: "tsv", name: "TSV 数据", description: "以制表符分列并查看结构化数据。", category: "code-data", native: false },
  { extension: "parquet", name: "Parquet 数据", description: "按需读取列式数据，无需上传或转换。", category: "code-data", native: false },
  { extension: "arrow", name: "Arrow IPC 数据", description: "流式读取 Arrow IPC 与 Feather 列式数据。", category: "code-data", native: false },
  { extension: "duckdb", name: "DuckDB 数据库", description: "浏览数据库中的数据表、列类型与记录。", category: "code-data", native: false },
  { extension: "sqlite", name: "SQLite 数据库", description: "通过随应用打包的 DuckDB SQLite 扩展浏览数据表。", category: "code-data", native: false },
  { extension: "html", name: "HTML 文件", description: "查看网页源码与安全预览。", category: "code-data", native: true },
  { extension: "obj", name: "OBJ 模型", description: "通用三维网格与材质引用格式。", category: "3d", native: false },
  { extension: "gltf", name: "glTF 场景", description: "面向实时渲染的三维传输格式。", category: "3d", native: false },
  { extension: "stl", name: "STL 模型", description: "常用于 3D 打印的三角网格格式。", category: "3d", native: false },
  { extension: "psd", name: "Photoshop", description: "查看分层位图设计文件的基础信息。", category: "design", native: false },
  { extension: "ai", name: "Illustrator", description: "预览矢量设计文件与画板信息。", category: "design", native: false },
  { extension: "fig", name: "Figma 文件", description: "检查 Figma 本地文件结构与资源。", category: "design", native: false },
];

export const categories: FileCategory[] = [
  { slug: "images-video", name: "图片与视频", eyebrow: "看见每个细节", description: "直接调用浏览器的图像解码、媒体播放与 WebCodecs 能力。", extensions: ["png", "jpg", "svg", "mp4", "webm"] },
  { slug: "documents", name: "文档", eyebrow: "阅读，不必等待", description: "在本地打开文档、表格与演示资料，不经过上传队列。", extensions: ["pdf", "docx", "xlsx"] },
  { slug: "code-data", name: "代码与数据", eyebrow: "让结构清晰可见", description: "检查文本、代码和结构化数据，适合快速排错与校验。", extensions: ["md", "json", "jsonl", "csv", "tsv", "parquet", "arrow", "duckdb", "sqlite", "html"] },
  { slug: "3d", name: "3D", eyebrow: "在浏览器里转动模型", description: "以 WebGL 与 WebGPU 为基础，浏览网格、材质和场景。", extensions: ["obj", "gltf", "stl"] },
  { slug: "design", name: "设计文件", eyebrow: "创意文件，也能本地打开", description: "查看常见设计格式的画布、图层与元信息。", extensions: ["psd", "ai", "fig"] },
];

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getFormat(extension: string) {
  return formats.find((format) => format.extension === extension.toLowerCase());
}

export function getCategoryFormats(slug: string) {
  return formats.filter((format) => format.category === slug);
}
