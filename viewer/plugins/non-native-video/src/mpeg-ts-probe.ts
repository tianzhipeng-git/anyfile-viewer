import type { MpegTsInspection } from "./types";

interface PacketLayout {
  readonly stride: 188 | 192 | 204;
  readonly syncOffset: 0 | 4;
}

interface ElementaryStream {
  readonly pid: number;
  readonly codec: "avc" | "hevc" | "aac" | "mp3";
  readonly type: "video" | "audio";
}

const MAX_SECTION_BYTES = 1024;
const LAYOUTS: readonly PacketLayout[] = [
  { stride: 188, syncOffset: 0 },
  { stride: 192, syncOffset: 4 },
  { stride: 204, syncOffset: 0 },
];

const VIDEO_STREAM_TYPES = new Map<number, "avc" | "hevc">([
  [0x1b, "avc"],
  [0x24, "hevc"],
]);
const AUDIO_STREAM_TYPES = new Map<number, "aac" | "mp3">([
  [0x03, "mp3"],
  [0x04, "mp3"],
  [0x0f, "aac"],
]);
const UNSUPPORTED_MEDIA_STREAM_TYPES = new Set([
  0x01, 0x02, 0x06, 0x10, 0x11, 0x20, 0x21, 0x42, 0x81, 0x82, 0x87,
]);

function packetLayout(bytes: Uint8Array): PacketLayout | undefined {
  return LAYOUTS.find(({ stride, syncOffset }) => {
    for (let index = 0; index < 3; index += 1) {
      if (bytes[syncOffset + index * stride] !== 0x47) return false;
    }
    return true;
  });
}

function packetPayload(
  bytes: Uint8Array,
  packetStart: number,
  layout: PacketLayout,
  pid: number,
) {
  const start = packetStart + layout.syncOffset;
  if (start + 188 > bytes.length || bytes[start] !== 0x47) return undefined;
  if ((bytes[start + 1] & 0x80) !== 0 || ((bytes[start + 3] >> 6) & 0x03) !== 0) return undefined;
  const packetPid = ((bytes[start + 1] & 0x1f) << 8) | bytes[start + 2];
  if (packetPid !== pid) return undefined;
  const adaptationControl = (bytes[start + 3] >> 4) & 0x03;
  if (adaptationControl === 0 || adaptationControl === 2) return undefined;
  let payloadStart = start + 4;
  if (adaptationControl === 3) payloadStart += 1 + bytes[payloadStart];
  if (payloadStart > start + 188) return undefined;
  return {
    bytes: bytes.subarray(payloadStart, start + 188),
    startsUnit: (bytes[start + 1] & 0x40) !== 0,
  };
}

function crc32Mpeg(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80000000) !== 0
        ? ((crc << 1) ^ 0x04c11db7) >>> 0
        : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function findSection(bytes: Uint8Array, layout: PacketLayout, pid: number, tableId: number) {
  let section = new Uint8Array(0);
  let expectedLength = 0;
  for (let packetStart = 0; packetStart + layout.syncOffset + 188 <= bytes.length; packetStart += layout.stride) {
    const payload = packetPayload(bytes, packetStart, layout, pid);
    if (!payload) continue;
    let chunk = payload.bytes;
    if (payload.startsUnit) {
      if (chunk.length < 1) continue;
      const sectionStart = 1 + chunk[0];
      if (sectionStart >= chunk.length || chunk[sectionStart] !== tableId) continue;
      section = new Uint8Array(0);
      expectedLength = 0;
      chunk = chunk.subarray(sectionStart);
    } else if (section.length === 0) {
      continue;
    }
    if (expectedLength === 0 && section.length + chunk.length >= 3) {
      const header = new Uint8Array(Math.min(3, section.length + chunk.length));
      header.set(section.subarray(0, header.length));
      header.set(chunk.subarray(0, header.length - section.length), section.length);
      expectedLength = 3 + (((header[1] & 0x0f) << 8) | header[2]);
      if (expectedLength < 12 || expectedLength > MAX_SECTION_BYTES) return undefined;
    }
    const remaining = expectedLength > 0 ? expectedLength - section.length : chunk.length;
    const combined = new Uint8Array(section.length + Math.min(remaining, chunk.length));
    combined.set(section);
    combined.set(chunk.subarray(0, combined.length - section.length), section.length);
    section = combined;
    if (expectedLength > 0 && section.length === expectedLength) {
      return crc32Mpeg(section) === 0 ? section : undefined;
    }
  }
  return undefined;
}

function pmtPid(pat: Uint8Array) {
  if ((pat[5] & 0x01) === 0 || pat[6] !== 0 || pat[7] !== 0) return undefined;
  const programs: number[] = [];
  for (let offset = 8; offset + 4 <= pat.length - 4; offset += 4) {
    const program = (pat[offset] << 8) | pat[offset + 1];
    if (program !== 0) programs.push(((pat[offset + 2] & 0x1f) << 8) | pat[offset + 3]);
  }
  return programs.length === 1 ? programs[0] : undefined;
}

function elementaryStreams(pmt: Uint8Array): ElementaryStream[] | undefined {
  if ((pmt[5] & 0x01) === 0 || pmt[6] !== 0 || pmt[7] !== 0) return undefined;
  const programInfoLength = ((pmt[10] & 0x0f) << 8) | pmt[11];
  let offset = 12 + programInfoLength;
  const streams: ElementaryStream[] = [];
  while (offset + 5 <= pmt.length - 4) {
    const streamType = pmt[offset];
    const pid = ((pmt[offset + 1] & 0x1f) << 8) | pmt[offset + 2];
    const infoLength = ((pmt[offset + 3] & 0x0f) << 8) | pmt[offset + 4];
    const videoCodec = VIDEO_STREAM_TYPES.get(streamType);
    const audioCodec = AUDIO_STREAM_TYPES.get(streamType);
    if (videoCodec) streams.push({ pid, codec: videoCodec, type: "video" });
    else if (audioCodec) streams.push({ pid, codec: audioCodec, type: "audio" });
    else if (UNSUPPORTED_MEDIA_STREAM_TYPES.has(streamType)) return undefined;
    offset += 5 + infoLength;
  }
  return offset === pmt.length - 4 ? streams : undefined;
}

function hasPesPacket(bytes: Uint8Array, layout: PacketLayout, pid: number) {
  for (let packetStart = 0; packetStart + layout.syncOffset + 188 <= bytes.length; packetStart += layout.stride) {
    const payload = packetPayload(bytes, packetStart, layout, pid);
    if (payload?.startsUnit && payload.bytes.length >= 6
      && payload.bytes[0] === 0 && payload.bytes[1] === 0 && payload.bytes[2] === 1) return true;
  }
  return false;
}

export function inspectMpegTs(bytes: Uint8Array): MpegTsInspection | undefined {
  const layout = packetLayout(bytes);
  if (!layout) return undefined;
  const pat = findSection(bytes, layout, 0, 0x00);
  const mapPid = pat && pmtPid(pat);
  const pmt = mapPid !== undefined ? findSection(bytes, layout, mapPid, 0x02) : undefined;
  const streams = pmt && elementaryStreams(pmt);
  if (!streams) return undefined;
  const videos = streams.filter((stream) => stream.type === "video");
  const audios = streams.filter((stream) => stream.type === "audio");
  if (videos.length !== 1 || audios.length > 1) return undefined;
  if (![...videos, ...audios].every((stream) => hasPesPacket(bytes, layout, stream.pid))) return undefined;
  return {
    videoCodec: videos[0].codec as "avc" | "hevc",
    audioCodec: (audios[0]?.codec as "aac" | "mp3" | undefined) ?? null,
  };
}
