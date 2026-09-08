import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { openFfmpeg } from "@anyfile/ffmpeg-playback";
import { inspectAvi } from "./probe";
import { ffmpegVideoManifest } from "./manifest";
export const ffmpegVideoViewer: FileViewerPlugin = {
  manifest: ffmpegVideoManifest,
  async open(context) {
    const expected = await inspectAvi(context);
    if (!expected) throw new ViewerError("invalid-file", selectMessages(context.locale, { en: "Unsupported AVI video.", "zh-CN": "不支持此 AVI 视频。" }));
    return openFfmpeg(context, true, info => info.video && info.videoCodec === "mpeg4" && info.width === expected.width && info.height === expected.height && info.audio === expected.audio && (!info.audio || info.audioCodec === "mp3" && info.channels === expected.channels && info.sampleRate === expected.sampleRate));
  },
};
