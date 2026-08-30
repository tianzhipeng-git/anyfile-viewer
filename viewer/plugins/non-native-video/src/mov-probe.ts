import { MAX_TRACKS } from "./probe-limits";
import type { ProbeSlices } from "./read-blob";

interface Box {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly payloadStart: number;
}

export interface MovInspection {
  readonly videoCodec: "avc" | "hevc";
  readonly audioCodec: "pcm-s16" | "pcm-s16be" | null;
}

function ascii(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function u32(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readBox(bytes: Uint8Array, offset: number, limit: number): Box | undefined {
  if (offset + 8 > limit) return undefined;
  const size32 = u32(bytes, offset);
  const header = size32 === 1 ? 16 : 8;
  if (offset + header > limit) return undefined;
  const size = size32 === 0
    ? limit - offset
    : size32 === 1 ? u32(bytes, offset + 8) * 2 ** 32 + u32(bytes, offset + 12) : size32;
  if (!Number.isSafeInteger(size) || size < header || offset + size > limit) return undefined;
  return { type: ascii(bytes, offset + 4), start: offset, end: offset + size, payloadStart: offset + header };
}

function children(bytes: Uint8Array, start: number, end: number) {
  const result: Box[] = [];
  let offset = start;
  while (offset < end && result.length <= 4096) {
    const box = readBox(bytes, offset, end);
    if (!box) return undefined;
    result.push(box);
    offset = box.end;
  }
  return offset === end ? result : undefined;
}

function childPath(bytes: Uint8Array, parent: Box, path: readonly string[]) {
  let current = parent;
  for (const type of path) {
    const next = children(bytes, current.payloadStart, current.end)?.find((box) => box.type === type);
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function containedMoov(bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.length) {
    const box = readBox(bytes, offset, bytes.length);
    if (!box) break;
    if (box.type === "moov") return bytes.subarray(box.start, box.end);
    offset = box.end;
  }
  for (let typeOffset = bytes.lastIndexOf(0x6d, bytes.length - 4); typeOffset >= 4;
    typeOffset = bytes.lastIndexOf(0x6d, typeOffset - 1)) {
    if (ascii(bytes, typeOffset) !== "moov") continue;
    const box = readBox(bytes, typeOffset - 4, bytes.length);
    if (box?.type === "moov") return bytes.subarray(box.start, box.end);
  }
  return undefined;
}

function sampleEntry(bytes: Uint8Array, track: Box) {
  const handler = childPath(bytes, track, ["mdia", "hdlr"]);
  const stsd = childPath(bytes, track, ["mdia", "minf", "stbl", "stsd"]);
  if (!handler || handler.payloadStart + 12 > handler.end || !stsd || stsd.payloadStart + 8 > stsd.end) {
    return { type: "unsupported" as const };
  }
  const type = ascii(bytes, handler.payloadStart + 8);
  if (type !== "vide" && type !== "soun") return { type: "other" as const };
  const entryCount = u32(bytes, stsd.payloadStart + 4);
  const entries = children(bytes, stsd.payloadStart + 8, stsd.end);
  if (entryCount !== 1 || entries?.length !== 1) return { type: "unsupported" as const };
  return { type, codec: entries[0].type } as const;
}

export function inspectMov({ head, tail }: ProbeSlices): MovInspection | undefined {
  const ftyp = readBox(head, 0, head.length);
  if (!ftyp || ftyp.type !== "ftyp" || ftyp.payloadStart + 4 > ftyp.end) return undefined;
  const brands = [ascii(head, ftyp.payloadStart)];
  for (let offset = ftyp.payloadStart + 8; offset + 4 <= ftyp.end; offset += 4) brands.push(ascii(head, offset));
  if (!brands.includes("qt  ")) return undefined;

  const moovBytes = containedMoov(head) ?? (tail ? containedMoov(tail) : undefined);
  if (!moovBytes) return undefined;
  const moov = readBox(moovBytes, 0, moovBytes.length);
  const tracks = moov && children(moovBytes, moov.payloadStart, moov.end)?.filter((box) => box.type === "trak");
  if (!tracks?.length || tracks.length > MAX_TRACKS) return undefined;

  const parsed = tracks.map((track) => sampleEntry(moovBytes, track));
  if (parsed.some(({ type }) => type === "unsupported")) return undefined;
  const videos = parsed.filter(({ type }) => type === "vide");
  const audios = parsed.filter(({ type }) => type === "soun");
  if (videos.length !== 1 || audios.length > 1) return undefined;
  const videoCodec = ["avc1", "avc3"].includes(videos[0].codec!)
    ? "avc" : ["hvc1", "hev1"].includes(videos[0].codec!) ? "hevc" : null;
  const audioCodec = audios.length === 0 ? null
    : audios[0].codec === "sowt" ? "pcm-s16"
      : audios[0].codec === "twos" ? "pcm-s16be" : undefined;
  return videoCodec && audioCodec !== undefined ? { videoCodec, audioCodec } : undefined;
}
