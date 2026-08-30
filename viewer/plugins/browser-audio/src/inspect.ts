import { inspectIsoBmff, inspectWebm } from "@anyfile/browser-video-viewer/container-inspection";
import { inspectOggStreams } from "@anyfile/non-native-video-viewer/container-inspection";
import type { ProbeViewerContext } from "@anyfile/viewer-protocol";

import { inspectAdts, inspectFlac, inspectMp3, inspectWave } from "./basic-formats";
import { readAudioProbeSlices } from "./read-blob";
import type { AudioFileInspection } from "./types";

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

function contains(bytes: Uint8Array | undefined, signature: readonly number[]) {
  if (!bytes) return false;
  outer: for (let offset = 0; offset + signature.length <= bytes.length; offset += 1) {
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[offset + index] !== signature[index]) continue outer;
    }
    return true;
  }
  return false;
}

export async function inspectBrowserAudioFile(
  { file, signal }: ProbeViewerContext,
): Promise<AudioFileInspection | undefined> {
  if (!file.size) return undefined;
  const extension = extensionOf(file.name);
  const slices = await readAudioProbeSlices(file, signal);
  if (extension === ".mp3") return inspectMp3(slices.head);
  if ([".wav", ".wave"].includes(extension)) return inspectWave(slices.head);
  if ([".flac", ".fla"].includes(extension)) return inspectFlac(slices.head);
  if ([".aac", ".adts"].includes(extension)) return inspectAdts(slices.head);
  if ([".m4a", ".mp4"].includes(extension)) {
    const inspection = inspectIsoBmff(slices);
    const track = inspection?.audioTracks[0];
    if (!inspection || inspection.container !== "MP4" || inspection.videoTracks.length
      || inspection.audioTracks.length !== 1 || track?.codecString !== "mp4a.40.2") return undefined;
    return { container: "MPEG-4", codec: "AAC-LC", mimeType: "audio/mp4", channels: track.channels, sampleRate: track.sampleRate };
  }
  if ([".ogg", ".oga", ".opus"].includes(extension)) {
    const inspection = inspectOggStreams(slices.head);
    if (!inspection || inspection.videoStreams || inspection.audioCodecs.length !== 1
      || !contains(slices.tail ?? slices.head, [0x4f, 0x67, 0x67, 0x53])) return undefined;
    const codec = inspection.audioCodecs[0];
    return { container: "Ogg", codec: codec === "opus" ? "Opus" : "Vorbis", mimeType: "audio/ogg" };
  }
  if (extension === ".webm") {
    const inspection = inspectWebm(slices.head);
    const track = inspection?.audioTracks[0];
    if (!inspection || inspection.videoTracks.length || inspection.audioTracks.length !== 1
      || !["opus", "vorbis"].includes(track?.codecString ?? "")
      || !contains(slices.head, [0x1c, 0x53, 0xbb, 0x6b])) return undefined;
    return { container: "WebM", codec: track!.codec, mimeType: "audio/webm", channels: track!.channels, sampleRate: track!.sampleRate };
  }
  return undefined;
}
