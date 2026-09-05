import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const report = JSON.parse(await readFile(join(root, ".next/diagnostics/viewer-bundle-report.json"), "utf8"));
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
for (const id of ["ffmpeg-audio", "ffmpeg-video"]) {
  const source = (await Promise.all(report.plugins[id].viewerFiles.map(file => readFile(join(root, ".next", file), "utf8")))).join("\n");
  if (!source.includes("ffmpeg-playback.worker.js")) throw new Error(`${id} is missing its deferred runtime client`);
}
console.log("FFmpeg runtime is isolated to the two deferred playback plugins");
