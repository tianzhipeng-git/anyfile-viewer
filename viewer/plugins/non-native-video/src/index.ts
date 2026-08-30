import type { FileViewerPlugin, OpenViewerContext } from "@anyfile/viewer-protocol";
import { nonNativeVideoManifest } from "./manifest";

function extensionOf(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

async function openNonNativeVideo(context: OpenViewerContext) {
  if ([".ogv", ".ogg"].includes(extensionOf(context.file.name))) {
    const { openOggVideo } = await import("./ogg-viewer");
    return openOggVideo(context);
  }
  const { openMediabunnyVideo } = await import("./mediabunny-viewer");
  return openMediabunnyVideo(context);
}

export const nonNativeVideoViewer: FileViewerPlugin = {
  manifest: nonNativeVideoManifest,
  open: openNonNativeVideo,
};

export { nonNativeVideoManifest } from "./manifest";
