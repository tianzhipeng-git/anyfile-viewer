import { calibreAlternative } from "./archive-shared";
import { defineFormat } from "./define-format";

export const djvuFormat = defineFormat(
  "djvu",
  "ebooks",
  4,
  {
    name: "DjVu document",
    title: "Read DjVu Files Online",
    description: "Open single-page and bundled multi-page .djvu and .djv books locally in your browser.",
    introduction:
      "View scanned books, technical manuals and academic papers in DjVu (.djvu / .djv) format directly in your browser without uploading files. Anyfile decodes pages on demand in a cancellable DjVuLibre WebAssembly Worker with outline navigation, virtualized thumbnails and selectable hidden text when available.",
    canShow: [
      "Single-page (FORM:DJVU, PM44, BM44) and bundled multi-page (FORM:DJVM) documents",
      "Visible-page on-demand Canvas rendering with fit-width, fit-page, zoom and keyboard paging",
      "Embedded outline bookmarks (NAVM), virtualized page thumbnails and validated hidden text layer (DjVuTXT)",
    ],
    limitations: [
      "Indirect multi-file DjVu documents referencing external page files are rejected with missing-related-file",
      "128 MiB file size, 5,000 pages, 16 Mi render pixels per page and 5 active rendered Canvas slots apply",
    ],
    faq: [
      {
        question: "Do I need to upload my DjVu file to convert it to PDF?",
        answer:
          "No. Anyfile runs a local DjVuLibre WebAssembly decoder inside your browser Worker and renders pages directly onto Canvas without server uploads or PDF conversion.",
      },
      {
        question: "Can I copy text from DjVu documents?",
        answer:
          "Yes, when the DjVu file includes an embedded DjVuTXT hidden text layer with valid word coordinates. Scanned pages without a hidden text layer display as page images without OCR.",
      },
    ],
  },
  {
    name: "DjVu 电子书文档",
    title: "在线阅读 DjVu 文档",
    description: "在浏览器本地直接打开单页与 bundled 多页 .djvu / .djv 电子书与扫描文献。",
    introduction:
      "无需安装 WinDjView 或上传转换，直接在浏览器中本地查看 DjVu（.djvu / .djv）扫描书籍、技术手册与学术论文。Anyfile 在可取消的 DjVuLibre WebAssembly Worker 中按可视页面按需解码，提供目录树、虚拟化缩略图与可用的隐藏文本层。",
    canShow: [
      "单页（FORM:DJVU / PM44 / BM44）与 bundled 多页（FORM:DJVM）文档渲染",
      "可视区域按需 Canvas 渲染，支持适应宽度、适应页面、缩放与键盘翻页",
      "内嵌书签目录（NAVM）、虚拟化缩略图与经过坐标校验的隐藏文本层（DjVuTXT）",
    ],
    limitations: [
      "暂不支持引用外部单页文件的 indirect 多文件 DjVu，打开时会明确提示 missing-related-file",
      "适用单文件 128 MiB、最多 5,000 页、单页 1,600 万渲染像素与最多 5 个活跃 Canvas 的资源预算",
    ],
    faq: [
      {
        question: "查看 DjVu 文件需要上传服务器或转成 PDF 吗？",
        answer:
          "不需要。Anyfile 在浏览器本地 Worker 中运行自建 DjVuLibre WebAssembly 解码器，直接按页渲染到 Canvas，全程不上传文件也不做 PDF 转换。",
      },
      {
        question: "能复制 DjVu 里的文字吗？",
        answer:
          "当文档自身包含坐标有效的 DjVuTXT 隐藏文本层时，查看器会自动叠加透明可选文本层；纯扫描无文本层页面不自动执行 OCR。",
      },
    ],
  },
  { possibleLevels: [4], verification: "verified" },
  calibreAlternative,
  ["djv"],
);
