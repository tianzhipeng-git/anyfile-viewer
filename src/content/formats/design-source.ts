import { defineFormat } from "./define-format";

export const figFormat = defineFormat(
  "fig",
  "images-video",
  3,
  {
    name: "Figma design file",
    title: "Open Figma (.fig) Files Online",
    description: "Inspect Figma .fig artboards, layers, text, colors, and dimensions locally in your browser.",
    introduction: "Figma (.fig) files package a document's Kiwi-encoded binary scenegraph, metadata, embedded images, and preview thumbnail inside a ZIP archive. Anyfile decodes the embedded Kiwi schema and Zstandard/Deflate chunks locally in your browser so engineers and reviewers can inspect confidential design handoffs without a Figma account or cloud upload.",
    canShow: [
      "Pages, top-level frames/artboards, and searchable nested layer tree",
      "Interactive 2D canvas preview with pan, zoom, and click-to-select dimension overlays",
      "Layer position, size, opacity, fills, strokes, typography, and one-click text/CSS copy",
      "Embedded thumbnail.png preview toggle when present in the archive",
    ],
    limitations: [
      "Complex vector boolean ops, blur/shadow effects, blend modes, and auto-layout reflow are approximated on the 2D canvas",
      "Read-only inspection; input is capped at 128 MiB and 60,000 nodes",
    ],
    faq: [
      {
        question: "Can I open a .fig file without a Figma account or uploading it?",
        answer: "Yes. Anyfile decodes the .fig archive and its internal Kiwi binary scenegraph directly inside your browser tab, so confidential client or product designs never leave your machine.",
      },
      {
        question: "Why does the canvas look slightly different from Figma desktop?",
        answer: "Figma uses a proprietary GPU compositor and custom fonts. Anyfile renders frames, shapes, text, and embedded images to 2D Canvas for fast inspection, and provides a one-click toggle to the archive's embedded preview thumbnail for visual reference.",
      },
    ],
  },
  {
    name: "Figma 设计稿文件",
    title: "在线打开 Figma (.fig) 文件（无需账号与上传）",
    description: "无需 Figma 账号或上传云端，在浏览器本地查看 .fig 设计稿画板、图层树、文字内容、色值与尺寸。",
    introduction: "Figma（.fig）文件将 Kiwi 二进制编码的场景图、元数据、内嵌图片与缩略图打包在 ZIP 归档中。Anyfile 在浏览器本地解码内嵌 Kiwi Schema 与 Zstandard/Deflate 数据块，方便研发、产品和 Windows/Linux 用户免上传查看涉密设计稿。",
    canShow: [
      "页面切换、顶层画板列表与可搜索的完整图层树",
      "交互式 2D 画布，支持平移、缩放与点击选中尺寸标注",
      "图层位置、宽高、圆角、填充/描边色值、字体样式与一键复制文字/CSS",
      "支持一键切换查看归档内嵌的 thumbnail.png 预览缩略图",
    ],
    limitations: [
      "复杂矢量布尔运算、阴影/模糊特效、混合模式与未安装字体在 2D 画布上为近似渲染",
      "仅支持只读检查；单文件上限 128 MiB，节点上限 60,000",
    ],
    faq: [
      {
        question: "没有 Figma 账号也能打开 .fig 文件吗？",
        answer: "可以。Anyfile 直接在本地浏览器中解析 .fig 归档与内部的 Kiwi 二进制数据，无需登录 Figma，也不会上传任何设计稿内容。",
      },
      {
        question: "为什么画布渲染与 Figma 客户端略有差异？",
        answer: "Figma 客户端使用专用渲染管线与云端字体。Anyfile 在本地 2D 画布上还原画板、形状、文字与内嵌图片用于快速核对尺寸和文案，并支持切换到文件自带的预览图做对照。",
      },
    ],
  },
  { possibleLevels: [2, 3] },
);

export const sketchFormat = defineFormat(
  "sketch",
  "images-video",
  3,
  {
    name: "Sketch design file",
    title: "Open Sketch (.sketch) Files Online",
    description: "View Sketch .sketch artboards, layers, text, and dimensions locally in any browser without macOS.",
    introduction: "Sketch (.sketch) documents (Sketch 43+) are ZIP archives storing document metadata, per-page JSON layer trees, bitmap assets, and a rendered preview thumbnail. Anyfile opens .sketch files directly in any desktop or mobile browser—including Windows and Linux—without needing macOS or uploading proprietary designs.",
    canShow: [
      "Multi-page navigation, artboard switcher, and searchable layer tree",
      "Interactive 2D canvas rendering of artboards, shapes, bezier paths, bitmaps, and attributedString text",
      "Inspector panel with exact X/Y/W/H coordinates, font attributes, fills/borders, and copyable text/CSS",
      "Embedded previews/preview.png thumbnail view toggle",
    ],
    limitations: [
      "Legacy pre-Sketch-43 SQLite .sketch files are not supported",
      "Symbol overrides, blur/shadow effects, and macOS-only fonts are approximated on the 2D canvas",
    ],
    faq: [
      {
        question: "How can I open a .sketch file on Windows without a Mac?",
        answer: "Drop the .sketch file into Anyfile in any modern browser. It unpacks the JSON pages and assets locally on Windows, Linux, or macOS without installing Sketch.",
      },
      {
        question: "Can I copy text and CSS measurements from a Sketch file?",
        answer: "Yes. Select any layer on the canvas or in the layer tree to inspect its position, dimensions, font family, size, color swatches, and copy the raw text or CSS snippet.",
      },
    ],
  },
  {
    name: "Sketch 设计稿文件",
    title: "在 Windows 或浏览器中本地打开 Sketch (.sketch) 文件",
    description: "无需 macOS 或 Sketch 客户端，在任意浏览器本地浏览 .sketch 画板、图层树、文字与尺寸标注。",
    introduction: "Sketch 43 及以上版本的 .sketch 文件采用 ZIP 归档，内部保存文档元数据、分页 JSON 图层树、位图资源与预览缩略图。Anyfile 让 Windows、Linux 与非设计团队成员在浏览器本地直接打开 .sketch 设计稿，无需上传涉密文件。",
    canShow: [
      "多页面切换、画板快速跳转与可搜索图层树",
      "交互式 2D 画布，渲染画板、矩形/椭圆、贝塞尔路径、位图与富文本图层",
      "属性检查器展示精确 X/Y/W/H 坐标、字体字号、填充/描边色值，并支持一键复制文字与 CSS",
      "支持一键切换查看内置 previews/preview.png 预览图",
    ],
    limitations: [
      "不支持 Sketch 43 之前的旧版 SQLite 格式 .sketch 文件",
      "Symbol 覆盖、模糊/阴影特效与 macOS 专用字体在 2D 画布上为近似渲染",
    ],
    faq: [
      {
        question: "Windows 电脑没有 Mac 怎么打开 .sketch 文件？",
        answer: "直接将 .sketch 文件拖入 Anyfile 即可在 Windows 浏览器中本地解析画板、图层、文案和尺寸，无需安装 Sketch 或上传到第三方云端。",
      },
      {
        question: "可以复制 Sketch 图层中的文字和 CSS 尺寸吗？",
        answer: "可以。在画布或左侧图层树点击任意图层，右侧属性检查器会显示坐标尺寸、字体与色值，并提供一键复制文字与 CSS 按钮。",
      },
    ],
  },
  { possibleLevels: [3] },
);
