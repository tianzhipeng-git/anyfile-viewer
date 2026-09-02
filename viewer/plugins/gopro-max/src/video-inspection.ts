import { inspectIsoBmff, type VideoFileInspection } from "@anyfile/browser-video-viewer/container-inspection";

import { readBlob } from "./read-blob";

const HEADER_BYTES = 64 * 1024;
const BOX_HEADER_BYTES = 16;
const MAX_MOOV_BYTES = 2 * 1024 * 1024;

export interface GoProMaxVideoInspection {
  readonly kind: "video";
  readonly device: "MAX" | "MAX2";
  readonly width: 4096 | 5952;
  readonly height: 1344 | 1920;
  readonly media: VideoFileInspection;
}

function ascii(bytes: Uint8Array, offset: number, length = 4) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function boxSize(bytes: Uint8Array, offset: number) {
  if (offset + 8 > bytes.length) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size32 = view.getUint32(offset);
  if (size32 === 0) return undefined;
  if (size32 !== 1) return size32 >= 8 ? size32 : undefined;
  if (offset + 16 > bytes.length) return undefined;
  const size = view.getBigUint64(offset + 8);
  return size >= BigInt(16) && size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(size) : undefined;
}

function locateMoov(head: Uint8Array, fileSize: number) {
  let offset = 0;
  while (offset + 8 <= head.length) {
    const size = boxSize(head, offset);
    if (!size || offset + size > fileSize) return undefined;
    const type = ascii(head, offset + 4);
    if (type === "moov") return offset;
    if (type === "mdat") return offset + size;
    if (offset + size > head.length) return undefined;
    offset += size;
  }
  return undefined;
}

function supportedLayout(media: VideoFileInspection) {
  if (media.container !== "MP4" || media.videoTracks.length !== 2) return undefined;
  const [first, second] = media.videoTracks;
  if (first.codec !== "HEVC/H.265" || second.codec !== "HEVC/H.265"
    || first.width !== second.width || first.height !== second.height) return undefined;
  const hasAac = media.audioTracks.some((track) => track.codec === "AAC-LC" && track.channels === 2 && track.sampleRate === 48000);
  if (!hasAac) return undefined;
  if (first.width === 4096 && first.height === 1344) return { device: "MAX", width: 4096, height: 1344 } as const;
  if (first.width === 5952 && first.height === 1920) return { device: "MAX2", width: 5952, height: 1920 } as const;
  return undefined;
}

export async function inspectGoProMaxVideo(file: File, signal: AbortSignal): Promise<GoProMaxVideoInspection | undefined> {
  if (file.size < 24) return undefined;
  const head = await readBlob(file.slice(0, Math.min(file.size, HEADER_BYTES)), signal);
  if (ascii(head, 4) !== "ftyp") return undefined;
  const moovOffset = locateMoov(head, file.size);
  if (moovOffset === undefined || moovOffset + 8 > file.size) return undefined;
  const moovHeader = await readBlob(file.slice(moovOffset, Math.min(file.size, moovOffset + BOX_HEADER_BYTES)), signal);
  if (moovHeader.length < 8 || ascii(moovHeader, 4) !== "moov") return undefined;
  const moovSize = boxSize(moovHeader, 0);
  if (!moovSize || moovSize > MAX_MOOV_BYTES || moovOffset + moovSize > file.size) return undefined;
  const moov = await readBlob(file.slice(moovOffset, moovOffset + moovSize), signal);
  if (!new TextDecoder("latin1").decode(moov).includes("GoPro H.265")) return undefined;
  const media = inspectIsoBmff({ head, tail: moov, tailOffset: moovOffset });
  const layout = media && supportedLayout(media);
  return media && layout ? { kind: "video", media, ...layout } : undefined;
}

export const GOPRO_MAX_VIDEO_PROBE_BUDGET = HEADER_BYTES + BOX_HEADER_BYTES + MAX_MOOV_BYTES;
