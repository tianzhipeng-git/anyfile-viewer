import { ViewerError, selectMessages, type FileViewerPlugin } from "@anyfile/viewer-protocol";
import { openFfmpeg } from "@anyfile/ffmpeg-playback";
import { inspectAiff } from "./probe";
import { ffmpegAudioManifest } from "./manifest";
export const ffmpegAudioViewer: FileViewerPlugin = {
  manifest: ffmpegAudioManifest,
  async open(context) {
    const expected = await inspectAiff(context);
    if (!expected) throw new ViewerError("invalid-file", selectMessages(context.locale, { en: "Unsupported AIFF/AIFC audio.", "zh-CN": "不支持此 AIFF/AIFC 音频。" }));
    return openFfmpeg(context, false, info => !info.video && info.audio && info.audioCodec === expected.codec && info.channels === expected.channels && info.sampleRate === expected.sampleRate);
  },
};
