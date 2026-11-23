import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

export function ofdCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      reading: "Reading OFD package…",
      parsing: "Reading fixed-layout pages…",
      ready: "OFD document opened",
      invalid: "The file is damaged or not a valid OFD document.",
      limit: "The OFD document exceeds browser safety limits (512 MiB file, 10,000 pages or per-page object budget).",
      unsupported: "This browser cannot decompress or draw OFD documents.",
      noOutline: "This OFD document has no outline.",
      renderFailed: "Unable to render this OFD page.",
    },
    "zh-CN": {
      reading: "正在读取 OFD 文档包…",
      parsing: "正在读取版式页面…",
      ready: "OFD 文档已打开",
      invalid: "文件已损坏，或不是有效的 OFD 版式文档。",
      limit: "OFD 文档超过浏览器安全资源上限（单文件 512 MiB、10,000 页或单页图元预算）。",
      unsupported: "当前浏览器无法解压或绘制 OFD 文档。",
      noOutline: "该 OFD 文档不包含大纲。",
      renderFailed: "无法渲染该 OFD 页面。",
    },
  });
}

export type OfdCopy = ReturnType<typeof ofdCopy>;
