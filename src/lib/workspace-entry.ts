import { safePath } from "./analytics/events";

const cameraNames: Record<string, string> = {
  insta360: "Insta360",
  "gopro-max": "GoPro MAX",
  "dji-osmo-360": "DJI Osmo 360",
};

export function workspaceEntry(entry: string | null) {
  const path = safePath(entry ?? "");
  const format = /^\/(?:en|zh-CN)\/formats\/([^/]+)$/.exec(path);
  if (format) return { label: `.${format[1].toUpperCase()}`, pairedInsv: format[1] === "insv" };
  const camera = /^\/(?:en|zh-CN)\/viewers\/([^/]+)$/.exec(path);
  if (camera && cameraNames[camera[1]]) return { label: cameraNames[camera[1]], pairedInsv: camera[1] === "insta360" };
  return undefined;
}
