import {
  validateRegistrations,
  type FileViewerPlugin,
  type ViewerPluginRegistration,
} from "@anyfile/viewer-protocol";
import { viewerRegistryEntries } from "@anyfile/viewer-registry";

// Browser-only dynamic viewer loaders keyed by manifest ID.
// Routing order, manifests, and dynamic probes are owned by @anyfile/viewer-registry.
const browserViewerLoaders: Readonly<Record<string, () => Promise<FileViewerPlugin>>> = {
  "comic-book-reader": async () => (await import("@anyfile/comic-book-reader")).comicBookViewer,
  "mobi-reader": async () => (await import("@anyfile/mobi-reader")).mobiViewer,
  "fictionbook-reader": async () => (await import("@anyfile/fictionbook-reader")).fictionBookViewer,
  "epub-reader": async () => (await import("@anyfile/epub-reader")).epubViewer,
  "chm-reader": async () => (await import("@anyfile/chm-reader")).chmViewer,
  "djvu-reader": async () => (await import("@anyfile/djvu-reader")).djvuViewer,
  "dji-osmo": async () => (await import("@anyfile/dji-osmo-viewer")).djiOsmoViewer,
  "gopro-max": async () => (await import("@anyfile/gopro-max-viewer")).goProMaxViewer,
  "insta360": async () => (await import("@anyfile/insta360-viewer")).insta360Viewer,
  "browser-video": async () => (await import("@anyfile/browser-video-viewer")).browserVideoViewer,
  "non-native-video": async () => (await import("@anyfile/non-native-video-viewer")).nonNativeVideoViewer,
  "browser-audio": async () => (await import("@anyfile/browser-audio-viewer")).browserAudioViewer,
  "non-native-audio": async () => (await import("@anyfile/non-native-audio-viewer")).nonNativeAudioViewer,
  "ffmpeg-video": async () => (await import("@anyfile/ffmpeg-video-viewer")).ffmpegVideoViewer,
  "ffmpeg-audio": async () => (await import("@anyfile/ffmpeg-audio-viewer")).ffmpegAudioViewer,
  "dicom": async () => (await import("@anyfile/dicom-viewer")).dicomViewer,
  "font-viewer": async () => (await import("@anyfile/font-viewer")).fontViewer,
  "browser-image": async () => (await import("@anyfile/browser-image-viewer")).browserImageViewer,
  "modern-raster": async () => (await import("@anyfile/modern-raster-viewer")).modernRasterViewer,
  "camera-raw": async () => (await import("@anyfile/camera-raw-viewer")).cameraRawViewer,
  "general-raster": async () => (await import("@anyfile/general-raster-viewer")).generalRasterViewer,
  "hdr-image": async () => (await import("@anyfile/hdr-image-viewer")).hdrImageViewer,
  "pixelmator-pxd": async () => (await import("@anyfile/pixelmator-pxd-viewer")).pixelmatorPxdViewer,
  "safe-svg": async () => (await import("@anyfile/safe-svg-viewer")).safeSvgViewer,
  "photoshop-document": async () => (await import("@anyfile/photoshop-viewer")).photoshopViewer,
  "microsoft-project": async () => (await import("@anyfile/mpp-viewer")).mppViewer,
  "pdfjs-pdf": async () => (await import("@anyfile/pdf-viewer")).pdfViewer,
  "postscript-document": async () => (await import("@anyfile/postscript-viewer")).postscriptViewer,
  "xps-reader": async () => (await import("@anyfile/xps-viewer")).xpsViewer,
  "ofd-reader": async () => (await import("@anyfile/ofd-viewer")).ofdViewer,
  "word-document": async () => (await import("@anyfile/word-viewer")).wordViewer,
  "excel-workbook": async () => (await import("@anyfile/excel-viewer")).excelViewer,
  "powerpoint-presentation": async () => (await import("@anyfile/powerpoint-viewer")).powerpointViewer,
  "iwork": async () => (await import("@anyfile/iwork-viewer")).iworkViewer,
  "legacy-office": async () => (await import("@anyfile/legacy-office-viewer")).legacyOfficeViewer,
  "calendar-contacts": async () => (await import("@anyfile/calendar-contacts-viewer")).calendarContactsViewer,
  "outlook-pst": async () => (await import("@anyfile/pst-viewer")).pstViewer,
  "mind-map": async () => (await import("@anyfile/mind-map-viewer")).mindMapViewer,
  "http-archive": async () => (await import("@anyfile/har-viewer")).harViewer,
  "bittorrent-metadata": async () => (await import("@anyfile/bittorrent-viewer")).bittorrentViewer,
  "ml-weights": async () => (await import("@anyfile/ml-weights-viewer")).mlWeightsViewer,
  "apple-plist": async () => (await import("@anyfile/plist-viewer")).plistViewer,
  "x509-certificate": async () => (await import("@anyfile/x509-certificate-viewer")).certificateViewer,
  "ace-code-text": async () => (await import("@anyfile/code-viewer")).codeViewer,
  "sqlite-database": async () => (await import("@anyfile/sqlite-viewer")).sqliteViewer,
  "statistical-data": async () => (await import("@anyfile/stat-data-viewer")).statDataViewer,
  "scientific-data": async () => (await import("@anyfile/scientific-data-viewer")).scientificDataPlugin,
  "dev-array-viewer": async () => (await import("@anyfile/dev-array-viewer")).devArrayViewer,
  "dev-wasm-viewer": async () => (await import("@anyfile/dev-wasm-viewer")).devWasmViewer,
  "dev-source-map-viewer": async () => (await import("@anyfile/dev-source-map-viewer")).devSourceMapViewer,
  "dev-native-binary-viewer": async () => (await import("@anyfile/dev-native-binary-viewer")).devNativeBinaryViewer,
  "duckdb-data": async () => (await import("@anyfile/duckdb-viewer")).duckdbViewer,
  "archive-metadata-viewer": async () => (await import("@anyfile/archive-metadata-viewer")).archiveMetadataViewer,
  "cad-2d": async () => (await import("@anyfile/cad-2d-viewer")).cad2dViewer,
  "cad-dwg": async () => (await import("@anyfile/cad-dwg-viewer")).dwgViewer,
  "ifc": async () => (await import("@anyfile/ifc-viewer")).ifcViewer,
  "cad-exchange": async () => (await import("@anyfile/cad-exchange-viewer")).cadExchangeViewer,
  "point-cloud": async () => (await import("@anyfile/point-cloud-viewer")).pointCloudViewer,
  "print-3d": async () => (await import("@anyfile/print-3d-viewer")).print3dViewer,
  "mesh-3d": async () => (await import("@anyfile/mesh-3d-viewer")).mesh3dViewer,
  "visio": async () => (await import("@anyfile/visio-viewer")).visioViewer,
  "hex-viewer": async () => (await import("@anyfile/hex-viewer")).hexViewer,
};

export const viewerRegistrations: readonly ViewerPluginRegistration[] = viewerRegistryEntries.map((entry) => {
  const load = browserViewerLoaders[entry.manifest.id];
  if (!load) {
    throw new Error(`Missing browser viewer loader for registered plugin "${entry.manifest.id}".`);
  }
  const { browserProbe, probe, manifest } = entry;
  return { manifest, probe: browserProbe ?? probe, load };
});

validateRegistrations(viewerRegistrations);
