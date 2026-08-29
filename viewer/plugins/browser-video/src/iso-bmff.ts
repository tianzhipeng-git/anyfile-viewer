import {
  VIDEO_PROBE_MAX_DEPTH,
  VIDEO_PROBE_MAX_ENTRIES,
  VIDEO_PROBE_MAX_TRACKS,
  type VideoProbeSlices,
} from "./read-blob";
import type {
  ParsedAudioTrack,
  ParsedVideoTrack,
  VideoContainer,
  VideoFileInspection,
} from "./types";

interface Box {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly payloadStart: number;
  readonly size: number;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function u64(bytes: Uint8Array, offset: number) {
  const value = u32(bytes, offset) * 2 ** 32 + u32(bytes, offset + 4);
  return Number.isSafeInteger(value) ? value : undefined;
}

function readBox(bytes: Uint8Array, offset: number, limit: number): Box | undefined {
  if (offset < 0 || offset + 8 > limit) return undefined;
  const size32 = u32(bytes, offset);
  const type = ascii(bytes, offset + 4, 4);
  const headerBytes = size32 === 1 ? 16 : 8;
  if (offset + headerBytes > limit) return undefined;
  const size = size32 === 0 ? limit - offset : size32 === 1 ? u64(bytes, offset + 8) : size32;
  if (size === undefined || size < headerBytes || !Number.isSafeInteger(offset + size) || offset + size > limit) return undefined;
  return { type, start: offset, end: offset + size, payloadStart: offset + headerBytes, size };
}

function childBoxes(bytes: Uint8Array, start: number, end: number, counter: { value: number }) {
  const boxes: Box[] = [];
  let offset = start;
  while (offset < end) {
    if (++counter.value > VIDEO_PROBE_MAX_ENTRIES) return undefined;
    const box = readBox(bytes, offset, end);
    if (!box) return undefined;
    boxes.push(box);
    offset = box.end;
  }
  return offset === end ? boxes : undefined;
}

function findChildPath(
  bytes: Uint8Array,
  parent: Box,
  path: readonly string[],
  counter: { value: number },
  depth = 0,
): Box | undefined {
  if (depth + path.length > VIDEO_PROBE_MAX_DEPTH) return undefined;
  let current = parent;
  for (const type of path) {
    const children = childBoxes(bytes, current.payloadStart, current.end, counter);
    const next = children?.find((box) => box.type === type);
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function parseFtyp(bytes: Uint8Array) {
  const ftyp = readBox(bytes, 0, bytes.length);
  if (!ftyp || ftyp.type !== "ftyp" || ftyp.size < 16) return undefined;
  const brands: string[] = [ascii(bytes, ftyp.payloadStart, 4)];
  for (let offset = ftyp.payloadStart + 8; offset + 4 <= ftyp.end; offset += 4) {
    brands.push(ascii(bytes, offset, 4));
  }
  const container: VideoContainer = brands.some((brand) => brand === "qt  ")
    ? "QuickTime"
    : brands.some((brand) => brand.startsWith("3gp") || brand.startsWith("3g2"))
      ? "3GPP"
      : "MP4";
  return { container, ftyp };
}

function findContainedMoov(bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.length) {
    const box = readBox(bytes, offset, bytes.length);
    if (!box) break;
    if (box.type === "moov") return bytes.subarray(box.start, box.end);
    offset = box.end;
  }

  let typeOffset = bytes.lastIndexOf(0x6d, bytes.length - 4);
  while (typeOffset >= 4) {
    if (bytes[typeOffset + 1] !== 0x6f
      || bytes[typeOffset + 2] !== 0x6f
      || bytes[typeOffset + 3] !== 0x76) {
      typeOffset = bytes.lastIndexOf(0x6d, typeOffset - 1);
      continue;
    }
    const box = readBox(bytes, typeOffset - 4, bytes.length);
    if (box?.type === "moov") return bytes.subarray(box.start, box.end);
    typeOffset = bytes.lastIndexOf(0x6d, typeOffset - 1);
  }
  return undefined;
}

function findMoov(slices: VideoProbeSlices) {
  return findContainedMoov(slices.head) ?? (slices.tail ? findContainedMoov(slices.tail) : undefined);
}

function findDescriptor(bytes: Uint8Array, box: Box, tag: number) {
  for (let offset = box.payloadStart + 4; offset + 2 <= box.end; offset += 1) {
    if (bytes[offset] !== tag) continue;
    let length = 0;
    let cursor = offset + 1;
    for (let index = 0; index < 4 && cursor < box.end; index += 1) {
      const value = bytes[cursor++];
      length = length * 128 + (value & 0x7f);
      if (!(value & 0x80)) return cursor + length <= box.end
        ? bytes.subarray(cursor, cursor + length)
        : undefined;
    }
  }
  return undefined;
}

function parseVideoEntry(bytes: Uint8Array, entry: Box, counter: { value: number }): ParsedVideoTrack {
  const width = entry.start + 36 <= entry.end ? u16(bytes, entry.start + 32) : undefined;
  const height = entry.start + 36 <= entry.end ? u16(bytes, entry.start + 34) : undefined;
  const children = entry.start + 86 <= entry.end
    ? childBoxes(bytes, entry.start + 86, entry.end, counter)
    : undefined;
  if (entry.type === "avc1" || entry.type === "avc3") {
    const config = children?.find((box) => box.type === "avcC");
    const codecString = config && config.payloadStart + 4 <= config.end
      ? `${entry.type}.${[bytes[config.payloadStart + 1], bytes[config.payloadStart + 2], bytes[config.payloadStart + 3]]
        .map((value) => value.toString(16).padStart(2, "0")).join("")}`
      : entry.type;
    return { codec: "AVC/H.264", codecString, width, height };
  }
  if (entry.type === "hvc1" || entry.type === "hev1") {
    return { codec: "HEVC/H.265", codecString: entry.type, width, height };
  }
  if (entry.type === "av01") {
    const config = children?.find((box) => box.type === "av1C");
    if (config && config.payloadStart + 4 <= config.end) {
      const profile = bytes[config.payloadStart + 1] >> 5;
      const level = bytes[config.payloadStart + 1] & 0x1f;
      const tier = bytes[config.payloadStart + 2] & 0x80 ? "H" : "M";
      const highBitDepth = Boolean(bytes[config.payloadStart + 2] & 0x40);
      const twelveBit = Boolean(bytes[config.payloadStart + 2] & 0x20);
      const bitDepth = twelveBit ? 12 : highBitDepth ? 10 : 8;
      return {
        codec: "AV1",
        codecString: `av01.${profile}.${level.toString().padStart(2, "0")}${tier}.${bitDepth.toString().padStart(2, "0")}`,
        width,
        height,
      };
    }
    return { codec: "AV1", codecString: "av01", width, height };
  }
  return { codec: entry.type, codecString: entry.type, width, height };
}

function parseAudioEntry(bytes: Uint8Array, entry: Box, counter: { value: number }): ParsedAudioTrack {
  const channels = entry.start + 26 <= entry.end ? u16(bytes, entry.start + 24) : undefined;
  const sampleRate = entry.start + 36 <= entry.end ? u16(bytes, entry.start + 32) : undefined;
  if (entry.type !== "mp4a") return { codec: entry.type, codecString: entry.type, channels, sampleRate };
  const version = entry.start + 18 <= entry.end ? u16(bytes, entry.start + 16) : 0;
  const childOffset = entry.start + (version === 1 ? 52 : version === 2 ? 72 : 36);
  const children = childOffset <= entry.end
    ? childBoxes(bytes, childOffset, entry.end, counter)
    : undefined;
  const wave = children?.find((box) => box.type === "wave");
  const waveChildren = wave ? childBoxes(bytes, wave.payloadStart, wave.end, counter) : undefined;
  const esds = children?.find((box) => box.type === "esds")
    ?? waveChildren?.find((box) => box.type === "esds");
  const config = esds ? findDescriptor(bytes, esds, 0x05) : undefined;
  const audioObjectType = config?.length ? config[0] >> 3 : undefined;
  return {
    codec: audioObjectType === 2 ? "AAC-LC" : "AAC",
    codecString: audioObjectType ? `mp4a.40.${audioObjectType}` : "mp4a",
    channels,
    sampleRate,
  };
}

function parseTrack(bytes: Uint8Array, trak: Box, counter: { value: number }) {
  const handler = findChildPath(bytes, trak, ["mdia", "hdlr"], counter);
  if (!handler || handler.payloadStart + 12 > handler.end) return { type: "other" as const };
  const handlerType = ascii(bytes, handler.payloadStart + 8, 4);
  if (handlerType !== "vide" && handlerType !== "soun") return { type: "other" as const };
  const stsd = findChildPath(bytes, trak, ["mdia", "minf", "stbl", "stsd"], counter);
  if (!stsd || stsd.payloadStart + 8 > stsd.end) return { type: "unsupported-media" as const };
  const entryCount = u32(bytes, stsd.payloadStart + 4);
  if (entryCount < 1 || entryCount > VIDEO_PROBE_MAX_TRACKS) return { type: "unsupported-media" as const };
  const entries = childBoxes(bytes, stsd.payloadStart + 8, stsd.end, counter);
  if (!entries || entries.length !== entryCount) return { type: "unsupported-media" as const };
  const entry = entries[0];
  if (handlerType === "vide") return { type: "video" as const, track: parseVideoEntry(bytes, entry, counter) };
  if (handlerType === "soun") return { type: "audio" as const, track: parseAudioEntry(bytes, entry, counter) };
  return { type: "other" as const };
}

export function inspectIsoBmff(slices: VideoProbeSlices): VideoFileInspection | undefined {
  const ftyp = parseFtyp(slices.head);
  const moovBytes = findMoov(slices);
  if (!ftyp || !moovBytes) return undefined;
  const moov = readBox(moovBytes, 0, moovBytes.length);
  if (!moov || moov.type !== "moov") return undefined;
  const counter = { value: 0 };
  const tracks = childBoxes(moovBytes, moov.payloadStart, moov.end, counter)
    ?.filter((box) => box.type === "trak");
  if (!tracks || tracks.length < 1 || tracks.length > VIDEO_PROBE_MAX_TRACKS) return undefined;

  const videoTracks: ParsedVideoTrack[] = [];
  const audioTracks: ParsedAudioTrack[] = [];
  let hasUnsupportedMediaTrack = false;
  for (const trak of tracks) {
    const parsed = parseTrack(moovBytes, trak, counter);
    if (parsed.type === "video") videoTracks.push(parsed.track);
    if (parsed.type === "audio") audioTracks.push(parsed.track);
    if (parsed.type === "unsupported-media") hasUnsupportedMediaTrack = true;
  }

  const videoCodec = videoTracks[0]?.codecString.slice(0, 4);
  const audioCodec = audioTracks[0]?.codecString;
  const hasAac = audioTracks.length === 1 && audioCodec === "mp4a.40.2";
  const codecsSupported = !hasUnsupportedMediaTrack
    && videoTracks.length === 1
    && audioTracks.length <= 1
    && (ftyp.container === "MP4"
      ? ((videoCodec === "avc1" || videoCodec === "avc3") && (audioTracks.length === 0 || hasAac))
        || (["hvc1", "hev1", "av01"].includes(videoCodec ?? "") && hasAac)
      : (videoCodec === "avc1" || videoCodec === "avc3") && hasAac);
  const mimeType = ftyp.container === "QuickTime"
    ? "video/quicktime"
    : ftyp.container === "3GPP"
      ? "video/3gpp"
      : "video/mp4";
  return { container: ftyp.container, mimeType, videoTracks, audioTracks, codecsSupported };
}
