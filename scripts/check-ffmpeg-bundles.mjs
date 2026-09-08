import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const report = JSON.parse(await readFile(join(root, ".next/diagnostics/viewer-bundle-report.json"), "utf8"));
const loadable = JSON.parse(await readFile(join(root, ".next/react-loadable-manifest.json"), "utf8"));
const panoramaFiles = Object.entries(loadable).filter(([key]) => key.endsWith("viewer/plugins/insta360/src/index.ts -> ./ffmpeg-playback")).flatMap(([, entry]) => entry.files);
if (!panoramaFiles.length) throw new Error("Missing deferred Insta360 software playback entry");
const markers = ["ffmpeg-playback.worker.js", "anyfile-ffmpeg-player", "FFmpeg operation timed out"];
for (const [id, plugin] of Object.entries(report.plugins)) {
  const files = id.startsWith("ffmpeg-") ? plugin.probeFiles : [...plugin.probeFiles, ...plugin.viewerFiles];
  for (const file of new Set(files)) {
    const code = await readFile(join(root, ".next", file), "utf8");
    for (const marker of markers) if (code.includes(marker)) throw new Error(`FFmpeg runtime leaked into ${id}: ${file}`);
  }
}
const html = await readFile(join(root, ".next/server/app/en/view.html"), "utf8");
for (const match of html.matchAll(/src="\/_next\/(static\/chunks\/[^"?]+\.js)/g)) {
  const code = await readFile(join(root, ".next", decodeURIComponent(match[1])), "utf8");
  if (markers.some(marker => code.includes(marker))) throw new Error("FFmpeg runtime entered /view initial scripts");
}
for (const id of ["ffmpeg-audio", "ffmpeg-video", "insta360"]) {
  const source = (await Promise.all((id === "insta360" ? panoramaFiles : report.plugins[id].viewerFiles).map(file => readFile(join(root, ".next", file), "utf8")))).join("\n");
  if (!source.includes("ffmpeg-playback.worker.js")) throw new Error(`${id} is missing its deferred runtime client`);
}
console.log("FFmpeg runtime is isolated to the deferred playback and Insta360 plugins");
