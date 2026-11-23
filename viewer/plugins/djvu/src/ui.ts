import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export function djvuCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      loading: "Reading DjVu locally…",
      invalid: "The DjVu file is damaged or not a valid DjVu document.",
      indirect: "Indirect multi-file DjVu documents require linked external page files and are not supported.",
      limit: "DjVu resource limit reached (128 MiB file, 5,000 pages, or 16 Mi render pixels).",
      unsupported: "DjVu WebAssembly rendering is unavailable in this environment.",
      noOutline: "This DjVu document has no outline.",
      renderFailed: "Unable to render this DjVu page.",
      sourceNotice: "DjVuLibre GPLv2+ source & notices",
    },
    "zh-CN": {
      loading: "正在本地读取 DjVu…",
      invalid: "DjVu 文件已损坏或不是有效的 DjVu 文档。",
      indirect: "不支持引用外部单页文件的 indirect 多文件 DjVu 文档。",
      limit: "达到 DjVu 资源上限（单文件 128 MiB、最多 5,000 页或单页 1,600 万渲染像素）。",
      unsupported: "当前环境不支持 DjVu WebAssembly 渲染。",
      noOutline: "该 DjVu 文档不包含目录。",
      renderFailed: "无法渲染该 DjVu 页面。",
      sourceNotice: "DjVuLibre GPLv2+ 源码与许可声明",
    },
  });
}

export type DjvuCopy = ReturnType<typeof djvuCopy>;
