import type { PublishedLocale } from "../i18n/config";

export const ANIMATION_SAMPLE_EXTENSIONS: readonly string[] = ["apng", "gif", "webp", "avif"];

type SampleContent = {
  download: string;
  source: string;
  copy: Record<PublishedLocale, { name: string; description: string; credit: string }>;
};

const samples = new Map<string, SampleContent>([
  ...ANIMATION_SAMPLE_EXTENSIONS.map((extension): [string, SampleContent] => [extension, {
    download: `/samples/animation/animated.${extension}`,
    source: "/samples/animation/README.md",
    copy: {
      en: {
        name: `${extension.toUpperCase()} gradient animation`,
        description: "Try a small gradient animation. Pause, step through frames and change playback speed when your browser supports frame decoding for this format.",
        credit: "Original Anyfile sample · Apache-2.0",
      },
      "zh-CN": {
        name: `${extension.toUpperCase()} 渐变动画`,
        description: "用小型渐变动画体验查看器。浏览器支持该格式的帧解码时，可暂停、逐帧查看并调整播放速度。",
        credit: "Anyfile 原创样例 · Apache-2.0",
      },
    },
  }]),
  ["skp", {
    download: "/samples/model/chair-and-table.skp",
    source: "/samples/model/README.md",
    copy: {
      en: { name: "A chair and table", description: "Rotate and zoom a small SketchUp v17 furniture model to try 3D viewing in your browser. Requires WebGL 2.", credit: "OpenSKP sample · MIT" },
      "zh-CN": { name: "桌椅模型", description: "使用小型 SketchUp v17 家具模型，体验在浏览器中旋转、缩放和查看三维模型。需要浏览器支持 WebGL 2。", credit: "OpenSKP 样例 · MIT" },
    },
  }],
  ["psb", {
    download: "/samples/design/color-study.psb",
    source: "/samples/design/README.md",
    copy: {
      en: { name: "Color study", description: "Preview a 512 × 320 PSB color study from its saved composite image. This small sample demonstrates image viewing; layers cannot be toggled or edited.", credit: "Original Anyfile sample · Apache-2.0" },
      "zh-CN": { name: "色彩合成图", description: "预览一份 512 × 320 的 PSB 色彩图稿。此小型样例展示已保存的合成图查看能力，不支持切换或编辑图层。", credit: "Anyfile 原创样例 · Apache-2.0" },
    },
  }],
]);

export function getFormatSample(extension: string, locale: PublishedLocale) {
  const sample = samples.get(extension);
  if (!sample) return undefined;
  return { download: sample.download, source: sample.source, ...sample.copy[locale] };
}
