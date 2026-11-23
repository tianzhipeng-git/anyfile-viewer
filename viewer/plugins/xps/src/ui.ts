import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export function xpsCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      reading: "Reading XPS package…",
      parsing: "Reading fixed pages…",
      ready: "XPS document opened",
      invalid: "The file is damaged or not a valid XPS / OpenXPS document.",
      limit: "The XPS document exceeds browser safety limits (512 MiB file, 10,000 pages or per-page element budget).",
      unsupported: "This browser cannot decompress or draw XPS documents.",
      noOutline: "This XPS document has no outline.",
      renderFailed: "Unable to render this XPS page.",
    },
    "zh-CN": {
      reading: "正在读取 XPS 文档包…",
      parsing: "正在读取固定版式页面…",
      ready: "XPS 文档已打开",
      invalid: "文件已损坏，或不是有效的 XPS / OpenXPS 文档。",
      limit: "XPS 文档超过浏览器安全资源上限（单文件 512 MiB、10,000 页或单页元素预算）。",
      unsupported: "当前浏览器无法解压或绘制 XPS 文档。",
      noOutline: "该 XPS 文档不包含目录。",
      renderFailed: "无法渲染该 XPS 页面。",
    },
  });
}

export type XpsCopy = ReturnType<typeof xpsCopy>;
