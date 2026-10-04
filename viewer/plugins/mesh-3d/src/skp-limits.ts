import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

const labels = {
  en: { input: "file size", entry: "expanded entry size", expanded: "total expanded size", entries: "archive entries", materials: "materials", textures: "textures", geometry: "geometry and texture data", vertices: "vertices", primitives: "mesh primitives", texture: "encoded texture size", nodes: "scene nodes", draws: "draw calls", depth: "scene depth", records: "parser records", output: "render buffer size", time: "parsing time" },
  "zh-CN": { input: "文件大小", entry: "单条目展开大小", expanded: "总展开大小", entries: "归档条目数", materials: "材质数", textures: "纹理数", geometry: "几何与纹理数据量", vertices: "顶点数", primitives: "网格数量", texture: "纹理编码大小", nodes: "场景节点数", draws: "绘制次数", depth: "场景深度", records: "解析记录数", output: "渲染缓冲大小", time: "解析时间" },
};
export interface SkpLimitDetail {
  metric: keyof typeof labels.en;
  actual: number;
  limit: number;
  unit: "MiB" | "s" | "";
}
export class SkpLimitError extends RangeError {
  constructor(readonly detail: SkpLimitDetail) { super(`SKP ${detail.metric} limit`); }
}
export function checkSkpLimit(metric: SkpLimitDetail["metric"], actual: number, limit: number, unit: SkpLimitDetail["unit"] = "") {
  if (actual > limit) throw new SkpLimitError({ metric, actual, limit, unit });
}
export function skpLimitMessage(locale: Locale, detail: SkpLimitDetail) {
  const label = selectMessages(locale, labels)[detail.metric];
  const actual = detail.actual.toLocaleString(locale, { maximumFractionDigits: 1 });
  const limit = detail.limit.toLocaleString(locale, { maximumFractionDigits: 1 });
  return selectMessages(locale, {
    en: `SketchUp ${label}: ${actual}${detail.unit ? ` ${detail.unit}` : ""}; viewer limit: ${limit}${detail.unit ? ` ${detail.unit}` : ""}.`,
    "zh-CN": `SketchUp ${label}为 ${actual}${detail.unit ? ` ${detail.unit}` : ""}，查看器上限为 ${limit}${detail.unit ? ` ${detail.unit}` : ""}。`,
  });
}
