import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { openFfmpeg } from "@anyfile/ffmpeg-playback";

import { inspectVideo } from "./probe";
import { ffmpegVideoManifest } from "./manifest";

export const ffmpegVideoViewer: FileViewerPlugin = {
  manifest: ffmpegVideoManifest,
  async open(context) {
    const expected = await inspectVideo(context);
    if (!expected) throw new ViewerError("invalid-file", selectMessages(context.locale, { en: "Unsupported video.", "zh-CN": "不支持此视频。" }));
    return openFfmpeg(context, true, info => info.video
      && info.videoCodec === expected.videoCodec && info.width === expected.width && info.height === expected.height
      && info.audio === expected.audio
      && (!info.audio || (info.audioCodec === expected.audioCodec && info.channels === expected.channels && info.sampleRate === expected.sampleRate)));
  },
};
