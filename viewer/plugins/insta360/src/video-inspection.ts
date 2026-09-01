import {
  inspectIsoBmff,
  type VideoFileInspection,
} from "@anyfile/browser-video-viewer/container-inspection";

import { readBlob } from "./read-blob";
import { parseInsvName, type InsvRole } from "./pairing";

const HEADER_BYTES = 64 * 1024;
const BOX_HEADER_BYTES = 16;
const MAX_MOOV_BYTES = 16 * 1024 * 1024;

export interface Insta360VideoInspection {
  readonly kind: "video";
  readonly width: 1024 | 2880;
  readonly height: 512 | 2880;
  readonly layout: "sbs" | "single";
  readonly role?: InsvRole;
  readonly media: VideoFileInspection;
  readonly moovOffset: number;
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

function hasSupportedTracks(media: VideoFileInspection, width: number, height: number) {
  const video = media.videoTracks[0];
  const audio = media.audioTracks[0];
  return media.container === "MP4"
    && media.codecsSupported
    && media.videoTracks.length === 1
    && media.audioTracks.length === 1
    && video.codec === "AVC/H.264"
    && video.width === width
    && video.height === height
    && audio.codec === "AAC-LC"
    && audio.sampleRate === 48000
    && audio.channels === 2;
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
  if (extension === ".lrv" && hasSupportedTracks(media, 1024, 512)) {
    return { kind: "video", width: 1024, height: 512, layout: "sbs", media, moovOffset };
  }
  const name = parseInsvName(file.name);
  if (extension === ".insv" && name && hasSupportedTracks(media, 2880, 2880)) {
    return { kind: "video", width: 2880, height: 2880, layout: "single", role: name.role, media, moovOffset };
  }
  return undefined;
}

export const INSTA360_VIDEO_PROBE_BUDGET = HEADER_BYTES + BOX_HEADER_BYTES + MAX_MOOV_BYTES;
