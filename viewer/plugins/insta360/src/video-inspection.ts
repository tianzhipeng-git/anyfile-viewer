import {
  inspectIsoBmff,
  type VideoFileInspection,
} from "@anyfile/browser-video-viewer/container-inspection";

import { readBlob } from "./read-blob";
import { parseInsvName, type InsvRole } from "./pairing";
import { inspectInsvMetadata, INSV_METADATA_PROBE_BUDGET, type InsvEmbeddedPreview } from "./insv-metadata";
import { projectionFromInsvCalibration, type PanoramaProjectionProfile } from "./projection";

const HEADER_BYTES = 64 * 1024;
const BOX_HEADER_BYTES = 16;
const MAX_MOOV_BYTES = 16 * 1024 * 1024;
const DEVICE_TAIL_BYTES = 64 * 1024;

export interface Insta360VideoInspection {
  readonly kind: "video";
  readonly device: "X3" | "One RS" | "X4" | "X5" | "X6";
  readonly width: 768 | 1024 | 1664 | 2880 | 3072 | 3840;
  readonly height: 384 | 512 | 832 | 2880 | 3072 | 3840;
  readonly layout: "sbs" | "paired-files" | "dual-track";
  readonly role?: InsvRole;
  readonly media: VideoFileInspection;
  readonly moovOffset: number;
  readonly projection?: PanoramaProjectionProfile;
  readonly preview?: InsvEmbeddedPreview;
}

function ascii(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function u32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function boxSize(bytes: Uint8Array, offset: number) {
  if (offset + 8 > bytes.length) return undefined;
  const size32 = u32(bytes, offset);
  if (size32 === 0) return undefined;
  if (size32 !== 1) return size32 >= 8 ? size32 : undefined;
  if (offset + 16 > bytes.length) return undefined;
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset + 8);
  return size >= BigInt(16) && size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(size) : undefined;
}

function locateMoovAfterMdat(head: Uint8Array, fileSize: number) {
  let offset = 0;
  while (offset + 8 <= head.length) {
    const type = ascii(head, offset + 4);
    const size = boxSize(head, offset);
    if (!size || offset + size > fileSize) return undefined;
    if (type === "moov") return offset;
    if (type === "mdat") return offset + size;
    if (offset + size > head.length) return undefined;
    offset += size;
  }
  return undefined;
}

function hasSupportedTracks(
  media: VideoFileInspection,
  codec: "AVC/H.264" | "HEVC/H.265",
  width: number,
  height: number,
  videoTracks = 1,
) {
  const audio = media.audioTracks[0];
  return media.container === "MP4"
    && media.videoTracks.length === videoTracks
    && media.audioTracks.length === 1
    && media.videoTracks.every((video) => video.codec === codec && video.width === width && video.height === height)
    && audio.codec === "AAC-LC"
    && audio.sampleRate === 48000
    && audio.channels === 2;
}

async function inspectModernDevice(file: File, signal: AbortSignal) {
  const start = Math.max(0, file.size - DEVICE_TAIL_BYTES);
  const tail = await readBlob(file.slice(start, file.size), signal);
  const text = new TextDecoder("latin1").decode(tail);
  if (text.includes("Insta360 X4")) return "X4" as const;
  if (text.includes("Insta360 X5")) return "X5" as const;
  if (text.includes("Insta360 X6")) return "X6" as const;
  return undefined;
}

export async function inspectInsta360Video(file: File, signal: AbortSignal): Promise<Insta360VideoInspection | undefined> {
  if (file.size < 24) return undefined;
  const head = await readBlob(file.slice(0, Math.min(file.size, HEADER_BYTES)), signal);
  if (ascii(head, 4) !== "ftyp") return undefined;
  const moovOffset = locateMoovAfterMdat(head, file.size);
  if (moovOffset === undefined || moovOffset + 8 > file.size) return undefined;

  const moovHeader = await readBlob(file.slice(moovOffset, Math.min(file.size, moovOffset + BOX_HEADER_BYTES)), signal);
  if (moovHeader.length < 8 || ascii(moovHeader, 4) !== "moov") return undefined;
  const moovSize = boxSize(moovHeader, 0);
  if (!moovSize || moovSize > MAX_MOOV_BYTES || moovOffset + moovSize > file.size) return undefined;
  const moov = await readBlob(file.slice(moovOffset, moovOffset + moovSize), signal);
  const media = inspectIsoBmff({ head, tail: moov, tailOffset: moovOffset });
  if (!media) return undefined;
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (extension === ".lrv" && hasSupportedTracks(media, "AVC/H.264", 1024, 512)) {
    return { kind: "video", device: "X3", width: 1024, height: 512, layout: "sbs", media, moovOffset };
  }
  if (extension === ".lrv" && hasSupportedTracks(media, "AVC/H.264", 1664, 832)) {
    return { kind: "video", device: "X4", width: 1664, height: 832, layout: "sbs", media, moovOffset };
  }
  if (extension === ".insv" && /^LRV_/i.test(file.name) && hasSupportedTracks(media, "AVC/H.264", 768, 384)) {
    return { kind: "video", device: "One RS", width: 768, height: 384, layout: "sbs", media, moovOffset };
  }
  const name = parseInsvName(file.name);
  if (extension === ".insv" && name && hasSupportedTracks(media, "AVC/H.264", 2880, 2880)) {
    return { kind: "video", device: "X3", width: 2880, height: 2880, layout: "paired-files", role: name.role, media, moovOffset };
  }
  if (extension === ".insv" && name && hasSupportedTracks(media, "AVC/H.264", 3072, 3072)) {
    return { kind: "video", device: "One RS", width: 3072, height: 3072, layout: "paired-files", role: name.role, media, moovOffset };
  }
  if (extension === ".insv" && hasSupportedTracks(media, "HEVC/H.265", 3840, 3840, 2)) {
    const metadata = await inspectInsvMetadata(file, signal);
    const device = metadata?.device ?? await inspectModernDevice(file, signal);
    if (device) {
      const projection = projectionFromInsvCalibration(metadata?.offsetV3, metadata?.cropWidth, metadata?.cropHeight);
      return { kind: "video", device, width: 3840, height: 3840, layout: "dual-track", media, moovOffset, projection, preview: metadata?.preview };
    }
  }
  return undefined;
}

export const INSTA360_VIDEO_PROBE_BUDGET = HEADER_BYTES + BOX_HEADER_BYTES + MAX_MOOV_BYTES
  + INSV_METADATA_PROBE_BUDGET + DEVICE_TAIL_BYTES;
