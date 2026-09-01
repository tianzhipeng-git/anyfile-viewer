import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const rootPackage = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
if (rootPackage.license !== "Apache-2.0") throw new Error("The project license must remain Apache-2.0");
const projectLicense = await readFile(join(projectRoot, "LICENSE"), "utf8").catch(() => "");
if (!projectLicense.includes("Apache License") || !projectLicense.includes("Version 2.0")) {
  throw new Error("The Apache-2.0 project license text is missing");
}
const thirdPartyNotices = await readFile(join(projectRoot, "THIRD_PARTY_NOTICES.md"), "utf8").catch(() => "");
for (const marker of ["MPL-2.0", "CDDL-1.0", "LGPL-3.0-or-later", "libvips", "HEVC patent"]) {
  if (!thirdPartyNotices.includes(marker)) throw new Error(`Third-party notices are missing ${marker}`);
}
const html = await readFile(join(projectRoot, ".next/server/app/en/view.html"), "utf8");
const assets = [...new Set(
  [...html.matchAll(/src="\/_next\/(static\/chunks\/[^"?]+\.js)/g)].map((match) => decodeURIComponent(match[1])),
)];

if (assets.length === 0) {
  throw new Error("No initial JavaScript assets were found for /en/view");
}

const contents = await Promise.all(
  assets.map((asset) => readFile(join(projectRoot, ".next", asset))),
);
const gzipBytes = contents.reduce((total, content) => total + gzipSync(content).byteLength, 0);
const maximumGzipBytes = 225 * 1024;
if (gzipBytes > maximumGzipBytes) {
  throw new Error(
    `/en/view initial JavaScript is ${(gzipBytes / 1024).toFixed(1)} KiB gzip; maximum is ${maximumGzipBytes / 1024} KiB`,
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
  "__anyfile_archive_probe_v1__",
  "__anyfile_dev_array_viewer_v1__",
  "__anyfile_dev_array_probe_v1__",
  "__anyfile_data_probe_v1__",
  "__anyfile_dev_wasm_probe_v1__",
  "__anyfile_dev_source_map_probe_v1__",
  "anyfile-wasm-viewer__viewport",
  "anyfile-source-map-viewer__viewport",
  "anyfile-hex-viewer__viewport",
  "anyfile-browser-image-viewer__viewport",
  "anyfile-general-raster-viewer__canvas",
  "anyfile-modern-raster-viewer__canvas",
  "anyfile-camera-raw-viewer__canvas",
  "anyfile-browser-video-viewer__video",
  "anyfile-non-native-video-viewer__controls",
  "anyfile-browser-audio-viewer__audio",
  "anyfile-non-native-audio-viewer__controls",
  "Video probe read budget exceeded",
  "Non-native video probe read budget exceeded",
  "Audio probe read budget exceeded",
  "Non-native audio probe read budget exceeded",
  "videoTrack must be an InputVideoTrack",
  "audioTrack must be an InputAudioTrack",
  "jxl-oxide-wasm",
  "heif-decoder.wasm",
  "LibRaw disposed",
  "Unknown compression method identifier:",
];
const bundledMarker = deferredImplementationMarkers.find((marker) => initialCode.includes(marker));
if (bundledMarker) {
  throw new Error(`/en/view initial JavaScript contains deferred viewer implementation: ${bundledMarker}`);
}

console.log(`/en/view initial JavaScript: ${(gzipBytes / 1024).toFixed(1)} KiB gzip across ${assets.length} files`);

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
const archiveProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("__anyfile_archive_probe_v1__"));
if (archiveProbeChunks.length === 0) throw new Error("Archive probe chunk was not found");
if (archiveProbeChunks.some(({ content }) => content.includes("__anyfile_archive_metadata_viewer_v1__"))) {
  throw new Error("Archive probe chunk contains the full archive viewer implementation");
}
const arrayViewerChunks = archiveChunkContents.filter(({ content }) => content.includes("__anyfile_dev_array_viewer_v1__"));
if (arrayViewerChunks.length === 0) throw new Error("Array viewer dynamic chunk was not found");
const arrayProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("__anyfile_dev_array_probe_v1__"));
if (arrayProbeChunks.length === 0) throw new Error("Array probe chunk was not found");
if (arrayProbeChunks.some(({ content }) => content.includes("__anyfile_dev_array_viewer_v1__"))) {
  throw new Error("Array probe chunk contains the full array viewer implementation");
}
const dataProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("__anyfile_data_probe_v1__"));
if (dataProbeChunks.length === 0) throw new Error("Data probe chunk was not found");
if (dataProbeChunks.some(({ content }) => content.includes("Starting DuckDB"))) {
  throw new Error("Data probe chunk contains the full DuckDB viewer implementation");
}
const wasmViewerChunks = archiveChunkContents.filter(({ content }) => content.includes("anyfile-wasm-viewer__viewport"));
if (wasmViewerChunks.length === 0) throw new Error("WASM viewer dynamic chunk was not found");
const wasmProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("__anyfile_dev_wasm_probe_v1__"));
if (wasmProbeChunks.length === 0) throw new Error("WASM probe chunk was not found");
if (wasmProbeChunks.some(({ content }) => content.includes("anyfile-wasm-viewer__viewport"))) {
  throw new Error("WASM probe chunk contains the full viewer implementation");
}
const sourceMapViewerChunks = archiveChunkContents.filter(({ content }) => content.includes("anyfile-source-map-viewer__viewport"));
if (sourceMapViewerChunks.length === 0) throw new Error("Source map viewer dynamic chunk was not found");
const sourceMapProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("__anyfile_dev_source_map_probe_v1__"));
if (sourceMapProbeChunks.length === 0) throw new Error("Source map probe chunk was not found");
if (sourceMapProbeChunks.some(({ content }) => content.includes("anyfile-source-map-viewer__viewport"))) {
  throw new Error("Source map probe chunk contains the full viewer implementation");
}
const videoProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("Video probe read budget exceeded"));
if (videoProbeChunks.length === 0) {
  throw new Error("Browser video probe chunk was not found");
}
if (videoProbeChunks.some(({ content }) => content.includes("anyfile-browser-video-viewer__video"))) {
  throw new Error("Browser video probe chunk contains the full video viewer implementation");
}
const nonNativeVideoProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("Non-native video probe read budget exceeded"));
if (nonNativeVideoProbeChunks.length === 0) {
  throw new Error("Non-native video probe chunk was not found");
}
const browserAudioProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("Audio probe read budget exceeded"));
if (browserAudioProbeChunks.length === 0) throw new Error("Browser audio probe chunk was not found");
if (browserAudioProbeChunks.some(({ content }) => content.includes("anyfile-browser-audio-viewer__audio")
  || content.includes("Decoded PCM buffer exceeds limits")
  || content.includes("audioTrack must be an InputAudioTrack"))) {
  throw new Error("Browser audio probe chunk contains a full audio player implementation");
}
const nonNativeAudioProbeChunks = archiveChunkContents.filter(({ content }) => content.includes("Non-native audio probe read budget exceeded"));
if (nonNativeAudioProbeChunks.length === 0) throw new Error("Non-native audio probe chunk was not found");
if (nonNativeAudioProbeChunks.some(({ content }) => content.includes("anyfile-non-native-audio-viewer__controls")
  || content.includes("Decoded PCM buffer exceeds limits")
  || content.includes("audioTrack must be an InputAudioTrack"))) {
  throw new Error("Non-native audio probe chunk contains Mediabunny or the full player implementation");
}
const nonNativeAudioViewerChunks = archiveChunkContents.filter(({ content }) => content.includes("anyfile-non-native-audio-viewer__controls"));
if (nonNativeAudioViewerChunks.length === 0) throw new Error("Non-native audio viewer chunk was not found");
const mediabunnyAudioChunks = archiveChunkContents.filter(({ content }) => content.includes("audioTrack must be an InputAudioTrack"));
if (mediabunnyAudioChunks.length === 0) throw new Error("Deferred Mediabunny audio implementation chunk was not found");
if (nonNativeVideoProbeChunks.some(({ content }) => content.includes("anyfile-non-native-video-viewer__controls")
  || content.includes("videoTrack must be an InputVideoTrack"))) {
  throw new Error("Non-native video probe chunk contains Mediabunny or the full player implementation");
}
const mediabunnyChunks = archiveChunkContents.filter(({ content }) => content.includes("videoTrack must be an InputVideoTrack"));
if (mediabunnyChunks.length === 0) {
  throw new Error("Deferred Mediabunny implementation chunk was not found");
}
const ogvViewerChunks = archiveChunkContents.filter(({ content }) => content.includes("OGV.js did not expose its runtime"));
if (ogvViewerChunks.length === 0) throw new Error("Deferred OGV.js viewer chunk was not found");
if (ogvViewerChunks.some(({ content }) => content.includes("videoTrack must be an InputVideoTrack"))
  || mediabunnyChunks.some(({ content }) => content.includes("OGV.js did not expose its runtime"))) {
  throw new Error("Mediabunny and OGV.js viewer implementations share a deferred chunk");
}
const mediabunnyPackage = JSON.parse(await readFile(join(
  projectRoot,
  "viewer/plugins/non-native-video/node_modules/mediabunny/package.json",
), "utf8"));
const mediabunnyLicense = await readFile(join(
  projectRoot,
  "public/vendor/licenses/mediabunny",
  mediabunnyPackage.version,
  "MPL-2.0.txt",
), "utf8").catch(() => "");
if (!mediabunnyLicense.includes("Mozilla Public License Version 2.0")) {
  throw new Error("Mediabunny MPL-2.0 license text is missing");
}
const mediabunnySourceNotice = await readFile(join(
  projectRoot,
  "public/vendor/licenses/mediabunny",
  mediabunnyPackage.version,
  "SOURCE.md",
), "utf8").catch(() => "");
if (!mediabunnySourceNotice.includes(mediabunnyPackage.version)
  || !mediabunnySourceNotice.includes("16f8889e144f2bbeaa6a6788009abb4ecef19847")) {
  throw new Error("Mediabunny exact source-availability notice is missing");
}
const ogvPackage = JSON.parse(await readFile(join(
  projectRoot,
  "viewer/plugins/non-native-video/node_modules/ogv/package.json",
), "utf8"));
const ogvRuntime = JSON.parse(await readFile(join(
  projectRoot,
  "viewer/plugins/non-native-video/ogv-runtime.json",
), "utf8"));
if (ogvRuntime.version !== ogvPackage.version) {
  throw new Error(`OGV.js runtime version ${ogvRuntime.version} does not match installed version ${ogvPackage.version}`);
}
const ogvSupportRoot = join(projectRoot, "public/vendor/ogv", ogvRuntime.version);
for (const asset of ogvRuntime.runtimeAssets) {
  const content = await readFile(join(ogvSupportRoot, asset)).catch(() => undefined);
  if (!content?.byteLength) throw new Error(`OGV.js runtime asset is missing: ${asset}`);
}
for (const { file, marker } of ogvRuntime.licenses) {
  const license = await readFile(join(ogvSupportRoot, file), "utf8").catch(() => "");
  if (!license.includes(marker)) throw new Error(`OGV.js license is missing or invalid: ${file}`);
}
console.log(
  `Non-native video: lightweight probe isolated; Mediabunny ${mediabunnyPackage.version} and OGV.js ${ogvPackage.version} split across deferred paths; licenses retained`,
);
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
for (const asset of [
  "index.js",
  "worker.js",
  "libraw.js",
  "libraw.wasm",
  "COPYRIGHT.LibRaw",
  "LICENSE.Emscripten",
  "LICENSE.LibRaw-CDDL-1.0",
  "LICENSE.Little-CMS-MIT",
  "LICENSE.libpng",
  "LICENSE.libraw-wasm-ISC",
  "LICENSE.zlib",
  "NOTICE.IJG-libjpeg",
  "SOURCE.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  const content = await readFile(join(librawSupportRoot, asset)).catch(() => undefined);
  if (!content?.byteLength) throw new Error(`LibRaw runtime asset is missing: ${asset}`);
}
const librawSourceNotice = await readFile(join(librawSupportRoot, "SOURCE.md"), "utf8");
for (const marker of [
  "32fd36a9883a10c1632bc20073f1ea88cc60487a",
  "b860248a89d9082b8e0a1e202e516f46af9adb29",
  "21c582a594fe5279f90c0b93437c398f93bf62b0",
  "263db4cffa6f9fc2ec514a70abac81362ea41849",
]) {
  if (!librawSourceNotice.includes(marker)) throw new Error(`LibRaw source notice is missing commit ${marker}`);
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
