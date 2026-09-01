import type { FormatContent } from "../types";

export const cameraRawCapability: Partial<FormatContent["capability"]> = {
  possibleLevels: [1, 2, 3],
  conditions: {
    en: ["Cross-origin isolation and WebAssembly support are required for local RAW development."],
    "zh-CN": ["本地 RAW 显影需要跨源隔离与 WebAssembly 支持。"],
  },
};

export const cameraRawAlternatives: FormatContent["alternatives"] = [{
  name: "Adobe Lightroom",
  url: "https://www.adobe.com/products/photoshop-lightroom.html",
  reason: {
    en: "Use a color-managed RAW editor when you need camera profiles, precise development controls or exported results.",
    "zh-CN": "需要相机配置、精确显影控制或导出结果时，请使用具备色彩管理的 RAW 编辑器。",
  },
}];
