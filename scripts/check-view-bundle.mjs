import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const html = await readFile(join(projectRoot, ".next/server/app/view.html"), "utf8");
const assets = [...new Set(
  [...html.matchAll(/src="\/_next\/(static\/chunks\/[^"?]+\.js)/g)].map((match) => match[1]),
)];

if (assets.length === 0) {
  throw new Error("No initial JavaScript assets were found for /view");
}

const contents = await Promise.all(
  assets.map((asset) => readFile(join(projectRoot, ".next", asset))),
);
const gzipBytes = contents.reduce((total, content) => total + gzipSync(content).byteLength, 0);
const maximumGzipBytes = 225 * 1024;
if (gzipBytes > maximumGzipBytes) {
  throw new Error(
    `/view initial JavaScript is ${(gzipBytes / 1024).toFixed(1)} KiB gzip; maximum is ${maximumGzipBytes / 1024} KiB`,
  );
}

const initialCode = Buffer.concat(contents).toString("utf8");
const deferredImplementationMarkers = [
  "ace-builds",
  "Starting DuckDB",
  "Starting SQLite",
  "正在读取 Word 文档",
  "正在读取 Excel 工作簿",
  "正在读取 PowerPoint 演示文稿",
  "anyfile-pdf-viewer__viewport",
  "__anyfile_archive_metadata_viewer_v1__",
  "anyfile-hex-viewer__viewport",
];
const bundledMarker = deferredImplementationMarkers.find((marker) => initialCode.includes(marker));
if (bundledMarker) {
  throw new Error(`/view initial JavaScript contains deferred viewer implementation: ${bundledMarker}`);
}

console.log(`/view initial JavaScript: ${(gzipBytes / 1024).toFixed(1)} KiB gzip across ${assets.length} files`);

const staticChunkDirectory = join(projectRoot, ".next/static/chunks");
const staticChunks = (await readdir(staticChunkDirectory))
  .filter((fileName) => fileName.endsWith(".js"));
const archiveChunkContents = await Promise.all(staticChunks.map(async (fileName) => ({
  fileName,
  content: await readFile(join(staticChunkDirectory, fileName)),
})));
const archiveChunks = archiveChunkContents.filter(({ content }) => {
  const code = content.toString("utf8");
  return code.includes("__anyfile_archive_metadata_viewer_v1__") || code.includes("Unsafe filename");
});
const archiveGzipBytes = archiveChunks.reduce(
  (total, { content }) => total + gzipSync(content, { level: 9 }).byteLength,
  0,
);
if (archiveChunks.length === 0) {
  throw new Error("Archive viewer dynamic chunks were not found");
}

const staticMedia = await readdir(join(projectRoot, ".next/static/media"), { withFileTypes: true }).catch(() => []);
const pdfWorkerAsset = staticMedia
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .find((fileName) => /^pdf\.worker\.min\..+\.mjs$/i.test(fileName));
if (!pdfWorkerAsset) {
  throw new Error("PDF.js Worker asset was not emitted");
}
const pdfjsPackage = JSON.parse(
  await readFile(join(projectRoot, "node_modules/pdfjs-dist/package.json"), "utf8"),
);
const pdfSupportRoot = join(projectRoot, "public/vendor/pdfjs", pdfjsPackage.version);
const pdfSupportAssets = [
  "cmaps/Adobe-CNS1-UCS2.bcmap",
  "standard_fonts/LiberationSans-Regular.ttf",
  "iccs/CGATS001Compat-v2-micro.icc",
  "wasm/jbig2.wasm",
  "wasm/jbig2_nowasm_fallback.js",
  "wasm/openjpeg.wasm",
  "wasm/openjpeg_nowasm_fallback.js",
  "wasm/qcms_bg.wasm",
];
for (const asset of pdfSupportAssets) {
  const content = await readFile(join(pdfSupportRoot, asset)).catch(() => undefined);
  if (!content?.byteLength) throw new Error(`PDF.js support asset is missing: ${asset}`);
}
const forbiddenZipAsset = staticMedia
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .find((fileName) => /zip-(?:module|web-worker).*\.(?:wasm|js)$/i.test(fileName));
if (forbiddenZipAsset) {
  throw new Error(`Archive viewer emitted a forbidden zip.js Worker/WASM asset: ${forbiddenZipAsset}`);
}

console.log(
  `Archive viewer implementation: ${(archiveGzipBytes / 1024).toFixed(1)} KiB gzip across ${archiveChunks.length} deferred chunks; no zip.js Worker/WASM assets`,
);
console.log(
  `PDF.js Worker: ${pdfWorkerAsset}; support assets prepared for ${pdfjsPackage.version}; viewer implementation remains deferred`,
);
