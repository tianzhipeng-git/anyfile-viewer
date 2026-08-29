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
  { extension: "apng", name: "APNG 动画图片", description: "保留透明通道与逐帧动画的 PNG 扩展格式。", category: "images-video", native: true },
  { extension: "jpg", name: "JPEG 图片", description: "适合照片与网页内容的通用图片格式。", category: "images-video", native: true },
  { extension: "gif", name: "GIF 动画图片", description: "支持调色板、透明索引与浏览器原生动画。", category: "images-video", native: true },
  { extension: "webp", name: "WebP 图片", description: "支持有损、无损、透明通道与动画。", category: "images-video", native: true },
  { extension: "avif", name: "AVIF 图片", description: "由当前浏览器原生解码的现代高压缩图片格式。", category: "images-video", native: true },
  { extension: "jxl", name: "JPEG XL 图片", description: "通过浏览器原生能力或本地 WASM 查看单帧与动画图片。", category: "images-video", native: false },
  { extension: "heic", name: "HEIC 图片", description: "通过浏览器原生能力或本地 HEVC WASM 查看主图像。", category: "images-video", native: false },
  { extension: "dng", name: "DNG 相机 RAW", description: "查看内嵌预览并在本地执行基础 RAW 显影。", category: "images-video", native: false },
  { extension: "cr2", name: "Canon CR2 RAW", description: "查看 Canon RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "cr3", name: "Canon CR3 RAW", description: "查看 Canon CR3 主预览与基础显影。", category: "images-video", native: false },
  { extension: "crw", name: "Canon CRW RAW", description: "查看早期 Canon CIFF RAW 的内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "nef", name: "Nikon NEF RAW", description: "查看 Nikon RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "nrw", name: "Nikon NRW RAW", description: "查看 Nikon Coolpix RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "arw", name: "Sony ARW RAW", description: "查看 Sony RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "sr2", name: "Sony SR2 RAW", description: "查看 Sony SR2 RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "srf", name: "Sony SRF RAW", description: "查看早期 Sony SRF RAW 的内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "raf", name: "Fujifilm RAF RAW", description: "查看 Fujifilm RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "orf", name: "Olympus ORF RAW", description: "查看 Olympus / OM System RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "pef", name: "Pentax PEF RAW", description: "查看 Pentax RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "rwl", name: "Leica RWL RAW", description: "查看 Leica RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "raw", name: "相机 RAW", description: "查看采用 Panasonic RAW 容器的相机文件。", category: "images-video", native: false },
  { extension: "rw2", name: "Panasonic RW2 RAW", description: "查看 Panasonic RAW 内嵌预览与基础显影。", category: "images-video", native: false },
  { extension: "tga", name: "TGA 图片", description: "本地解码未压缩与 RLE 的传统栅格图片。", category: "images-video", native: false },
  { extension: "pnm", name: "Netpbm 图片", description: "查看 PBM、PGM、PPM 与 PAM 栅格图片。", category: "images-video", native: false },
  { extension: "tiff", name: "TIFF 图片", description: "分片读取常见压缩、分块与多页 TIFF。", category: "images-video", native: false },
  { extension: "svg", name: "SVG 矢量图", description: "可缩放、可检查源码的矢量图形。", category: "images-video", native: true },
  { extension: "mp4", name: "MP4 视频", description: "本地播放已验证的 AVC、HEVC 或 AV1 + AAC-LC 组合，以及 AVC video-only 文件。", category: "images-video", native: true },
  { extension: "webm", name: "WebM 视频", description: "本地播放已验证的 VP8/Vorbis、VP9/Opus 与 VP9 video-only 组合。", category: "images-video", native: true },
  { extension: "mov", name: "QuickTime 视频", description: "本地播放已验证的 AVC + AAC-LC QuickTime 组合。", category: "images-video", native: true },
  { extension: "3gp", name: "3GPP 视频", description: "本地播放已验证的 AVC + AAC-LC 3GPP 组合。", category: "images-video", native: true },
  { extension: "mkv", name: "Matroska 视频", description: "通过本地 WebCodecs 播放已验证的 AVC、HEVC、VP8、VP9 或 AV1 与常见主音轨组合。", category: "images-video", native: false },
  { extension: "pdf", name: "PDF 文档", description: "查看版式固定的文档与电子资料。", category: "documents", native: true },
  { extension: "docx", name: "Word 文档", description: "预览 Office Open XML 文字文档。", category: "documents", native: false },
  { extension: "xlsx", name: "Excel 表格", description: "查看工作表、数据与基础格式。", category: "documents", native: false },
  { extension: "xls", name: "Excel 97–2003 表格", description: "查看旧版二进制 Excel 工作簿。", category: "documents", native: false },
  { extension: "xlsb", name: "Excel 二进制表格", description: "查看 Excel 二进制工作簿的数据。", category: "documents", native: false },
  { extension: "ods", name: "OpenDocument 表格", description: "查看开放文档电子表格。", category: "documents", native: false },
  { extension: "pptx", name: "PowerPoint 演示文稿", description: "本地渲染 Office Open XML 幻灯片。", category: "documents", native: false },
  { extension: "md", name: "Markdown", description: "阅读纯文本标记与渲染结果。", category: "code-data", native: true },
  { extension: "json", name: "JSON 数据", description: "以数据表方式分页浏览 JSON 记录。", category: "code-data", native: false },
  { extension: "jsonl", name: "JSON Lines", description: "逐行解析并分页浏览 JSON 记录流。", category: "code-data", native: false },
  { extension: "csv", name: "CSV 数据", description: "自动识别列类型并以表格方式分页浏览。", category: "code-data", native: false },
  { extension: "tsv", name: "TSV 数据", description: "以制表符分列并查看结构化数据。", category: "code-data", native: false },
  { extension: "parquet", name: "Parquet 数据", description: "按需读取列式数据，无需上传或转换。", category: "code-data", native: false },
  { extension: "arrow", name: "Arrow IPC 数据", description: "流式读取 Arrow IPC 与 Feather 列式数据。", category: "code-data", native: false },
  { extension: "duckdb", name: "DuckDB 数据库", description: "浏览数据库中的数据表、列类型与记录。", category: "code-data", native: false },
  { extension: "sqlite", name: "SQLite 数据库", description: "通过独立的 SQLite Wasm 查看器浏览数据表。", category: "code-data", native: false },
  { extension: "html", name: "HTML 文件", description: "查看网页源码与安全预览。", category: "code-data", native: true },
  { extension: "har", name: "HTTP Archive", description: "检查网络请求、响应头、传输大小与耗时明细。", category: "code-data", native: true },
  { extension: "obj", name: "OBJ 模型", description: "通用三维网格与材质引用格式。", category: "3d", native: false },
  { extension: "gltf", name: "glTF 场景", description: "面向实时渲染的三维传输格式。", category: "3d", native: false },
  { extension: "stl", name: "STL 模型", description: "常用于 3D 打印的三角网格格式。", category: "3d", native: false },
  { extension: "psd", name: "Photoshop", description: "查看分层位图设计文件的基础信息。", category: "design", native: false },
  { extension: "ai", name: "Illustrator", description: "预览矢量设计文件与画板信息。", category: "design", native: false },
  { extension: "fig", name: "Figma 文件", description: "检查 Figma 本地文件结构与资源。", category: "design", native: false },
];

export const categories: FileCategory[] = [
  { slug: "images-video", name: "图片与视频", eyebrow: "看见每个细节", description: "通过浏览器原生能力或本地 Worker 解码查看图片与媒体。", extensions: ["png", "apng", "jpg", "gif", "webp", "avif", "jxl", "heic", "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "sr2", "srf", "raf", "orf", "pef", "rwl", "raw", "rw2", "tga", "pnm", "tiff", "svg", "mp4", "webm", "mov", "3gp", "mkv"] },
  { slug: "documents", name: "文档", eyebrow: "阅读，不必等待", description: "在本地打开文档、表格与演示资料，不经过上传队列。", extensions: ["pdf", "docx", "xlsx", "xls", "xlsb", "ods", "pptx"] },
  { slug: "code-data", name: "代码与数据", eyebrow: "让结构清晰可见", description: "检查文本、代码和结构化数据，适合快速排错与校验。", extensions: ["md", "json", "jsonl", "csv", "tsv", "parquet", "arrow", "duckdb", "sqlite", "html", "har"] },
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
