import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
export function comicCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      previous: "Previous page",
      next: "Next page",
      page: "Page",
      mode: "Reading mode",
      single: "Single page",
      double: "Two pages",
      continuous: "Continuous",
      direction: "Reading direction",
      ltr: "Left to right",
      rtl: "Right to left",
      fit: "Page fit",
      width: "Fit width",
      height: "Fit height",
      zoom: "Zoom",
      loading: "Loading page…",
      invalid: "The comic archive or page is damaged or unsupported.",
      limit: "This comic exceeds the safe reading resource limits.",
      protected: "Encrypted comics are not supported. No password or decryption is attempted.",
      environment: "This browser does not provide the required image or decompression features.",
    },
    "zh-CN": {
      previous: "上一页",
      next: "下一页",
      page: "页码",
      mode: "阅读模式",
      single: "单页",
      double: "双页",
      continuous: "连续滚动",
      direction: "阅读方向",
      ltr: "从左到右",
      rtl: "从右到左",
      fit: "页面适配",
      width: "适宽",
      height: "适高",
      zoom: "缩放",
      loading: "正在加载页面…",
      invalid: "漫画归档或图片已损坏或不受支持。",
      limit: "漫画超过安全阅读资源上限。",
      protected: "不支持加密漫画归档；不会请求密码或尝试解密。",
      environment: "浏览器缺少必需的图片或解压能力。",
    },
  });
}
export function comicSelect(
  label: string,
  options: [string, string][],
  change: (value: string) => void,
) {
  const node = document.createElement("select");
  node.setAttribute("aria-label", label);
  node.title = label;
  for (const [value, text] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    node.append(option);
  }
  node.onchange = () => change(node.value);
  return node;
}
export function comicButton(label: string, action: () => void) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.onclick = action;
  return node;
}
