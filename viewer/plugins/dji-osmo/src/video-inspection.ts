import { inspectIsoBmff, type VideoFileInspection } from "@anyfile/browser-video-viewer/container-inspection";

import { readBlob } from "./read-blob";

const HEADER_BYTES = 64 * 1024;
const BOX_HEADER_BYTES = 16;
const MAX_MOOV_BYTES = 2 * 1024 * 1024;

export interface DjiOsmoVideoInspection {
  readonly kind: "video";
  readonly device: "Osmo 360";
  readonly width: 3840;
  readonly height: 3840;
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
  if (media.container !== "MP4") return false;
  const videos = media.videoTracks.filter((track) => track.codec === "HEVC/H.265");
  const audio = media.audioTracks.find((track) => track.codec === "AAC-LC");
  return videos.length === 2
    && videos.every((track) => track.width === 3840 && track.height === 3840)
    && audio?.channels === 2 && audio.sampleRate === 48000;
}

export async function inspectDjiOsmoVideo(file: File, signal: AbortSignal): Promise<DjiOsmoVideoInspection | undefined> {
  if (file.size < 24) return undefined;
  const head = await readBlob(file.slice(0, Math.min(file.size, HEADER_BYTES)), signal);
  if (ascii(head, 4) !== "ftyp") return undefined;
  const headText = new TextDecoder("latin1").decode(head);
  if (!headText.includes("dvtm_oq101.proto") || !headText.includes("Osmo 360")) return undefined;
  const moovOffset = locateMoov(head, file.size);
  if (moovOffset === undefined || moovOffset + 8 > file.size) return undefined;
  const moovHeader = await readBlob(file.slice(moovOffset, Math.min(file.size, moovOffset + BOX_HEADER_BYTES)), signal);
  if (moovHeader.length < 8 || ascii(moovHeader, 4) !== "moov") return undefined;
  const moovSize = boxSize(moovHeader, 0);
  if (!moovSize || moovSize > MAX_MOOV_BYTES || moovOffset + moovSize > file.size) return undefined;
  const moov = await readBlob(file.slice(moovOffset, moovOffset + moovSize), signal);
  const moovText = new TextDecoder("latin1").decode(moov);
  if (!moovText.includes("djmd") || !moovText.includes("dbgi")) return undefined;
  const media = inspectIsoBmff({ head, tail: moov, tailOffset: moovOffset });
  return media && supportedLayout(media)
    ? { kind: "video", device: "Osmo 360", width: 3840, height: 3840, media }
    : undefined;
}

export const DJI_OSMO_VIDEO_PROBE_BUDGET = HEADER_BYTES + BOX_HEADER_BYTES + MAX_MOOV_BYTES;
