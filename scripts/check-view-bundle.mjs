import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  "anyfile-image-viewer__viewport",
  "anyfile-general-raster-viewer__canvas",
  "anyfile-modern-raster-viewer__canvas",
  "anyfile-camera-raw-viewer__canvas",
  "jxl-oxide-wasm",
  "heif-decoder.wasm",
  "LibRaw disposed",
  "Unknown compression method identifier:",
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
const heifRuntimeSource = await readFile(join(projectRoot, "viewer/plugins/modern-raster/src/heif-runtime.ts"), "utf8");
const heifRuntimeVersion = heifRuntimeSource.match(/HEIF_ARTIFACT_VERSION = "([^"]+)"/)?.[1];
if (!heifRuntimeVersion) throw new Error("HEIF runtime artifact version is missing");
const heifSourceRoot = join(projectRoot, "third_party/heif-wasm", heifRuntimeVersion);
const heifBuildInfo = JSON.parse(await readFile(join(heifSourceRoot, "build-info.json"), "utf8"));
const heifSupportRoot = join(projectRoot, "public/vendor/libheif", heifRuntimeVersion);
for (const [asset, expected] of Object.entries(heifBuildInfo.artifacts)) {
  const content = await readFile(join(heifSupportRoot, asset)).catch(() => undefined);
  const sha256 = content && createHash("sha256").update(content).digest("hex");
  if (!content?.byteLength || content.byteLength !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error(`HEIF runtime asset is missing or failed its integrity check: ${asset}`);
  }
}
const jxlChunks = archiveChunkContents.filter(({ content }) => content.includes("JxlImage"));
if (jxlChunks.length === 0) {
  throw new Error("Unable to locate the deferred JPEG XL runtime chunk");
}
if (jxlChunks.some(({ content }) => content.includes("heif-decoder.wasm"))) {
  throw new Error("HEIF runtime URL was bundled into a JPEG XL decoder chunk");
}
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
const librawPackage = JSON.parse(
  await readFile(join(projectRoot, "node_modules/libraw-wasm/package.json"), "utf8"),
);
const librawDecoderSource = await readFile(
  join(projectRoot, "viewer/plugins/camera-raw/src/raw-decoder.ts"),
  "utf8",
);
const librawRuntimeVersion = librawDecoderSource.match(/\/vendor\/libraw\/([^/"']+)\/index\.js/)?.[1];
if (librawRuntimeVersion !== librawPackage.version) {
  throw new Error(`LibRaw runtime URL version ${librawRuntimeVersion ?? "is missing"}; installed version is ${librawPackage.version}`);
}
const librawSupportRoot = join(projectRoot, "public/vendor/libraw", librawPackage.version);
for (const asset of ["index.js", "worker.js", "libraw.js", "libraw.wasm"]) {
  const content = await readFile(join(librawSupportRoot, asset)).catch(() => undefined);
  if (!content?.byteLength) throw new Error(`LibRaw runtime asset is missing: ${asset}`);
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
console.log(`LibRaw ${librawPackage.version}: same-origin Worker, pthread and WASM assets prepared; runtime remains deferred`);
console.log(`libheif ${heifRuntimeVersion}: verified same-origin JS/WASM and license assets; runtime remains deferred`);
