import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
export function epubCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      previous: "Previous chapter",
      next: "Next chapter",
      contents: "Contents",
      size: "Font size",
      spacing: "Line height",
      width: "Text width",
      theme: "Theme",
      light: "Light",
      dark: "Dark",
      loading: "Loading chapter…",
      invalid: "The EPUB is damaged or uses unsupported content.",
      missing: "A required book resource is missing.",
      limit: "This book exceeds the safe reading resource limits.",
      protected:
        "Protected, obfuscated or fixed-layout EPUB content is not supported. No decryption is attempted.",
      environment: "This browser does not provide the required reading features.",
    },
    "zh-CN": {
      previous: "上一章",
      next: "下一章",
      contents: "目录",
      size: "字号",
      spacing: "行高",
      width: "内容宽度",
      theme: "主题",
      light: "浅色",
      dark: "深色",
      loading: "正在加载章节…",
      invalid: "EPUB 已损坏或包含不支持的内容。",
      missing: "缺少必需的图书资源。",
      limit: "图书超过安全阅读资源上限。",
      protected: "不支持受保护、字体混淆或固定版式 EPUB；不会尝试解密。",
      environment: "浏览器缺少必需的阅读能力。",
    },
  });
}
export function button(label: string, action: () => void) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.onclick = action;
  return node;
}
export function select(
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
