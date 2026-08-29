import {
  VIDEO_PROBE_MAX_DEPTH,
  VIDEO_PROBE_MAX_ENTRIES,
  VIDEO_PROBE_MAX_TRACKS,
} from "./read-blob";
import type {
  ParsedAudioTrack,
  ParsedVideoTrack,
  VideoFileInspection,
} from "./types";

interface Vint {
  readonly length: number;
  readonly value: number;
  readonly unknown: boolean;
}

interface Element {
  readonly id: number;
  readonly start: number;
  readonly payloadStart: number;
  readonly end: number;
}

function readVint(bytes: Uint8Array, offset: number, preserveMarker: boolean): Vint | undefined {
  const first = bytes[offset];
  if (first === undefined || first === 0) return undefined;
  let mask = 0x80;
  let length = 1;
  while (!(first & mask) && length <= 8) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return undefined;
  let value = preserveMarker ? first : first & (mask - 1);
  let unknown = !preserveMarker && (first & (mask - 1)) === mask - 1;
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index];
    unknown &&= bytes[offset + index] === 0xff;
  }
  if (!Number.isSafeInteger(value)) return undefined;
  return { length, value, unknown };
}

function readElement(bytes: Uint8Array, offset: number, limit: number): Element | undefined {
  const id = readVint(bytes, offset, true);
  if (!id) return undefined;
  const size = readVint(bytes, offset + id.length, false);
  if (!size || size.unknown) return undefined;
  const payloadStart = offset + id.length + size.length;
  const end = payloadStart + size.value;
  if (!Number.isSafeInteger(end) || end > limit) return undefined;
  return { id: id.value, start: offset, payloadStart, end };
}

function children(bytes: Uint8Array, start: number, end: number, counter: { value: number }) {
  const result: Element[] = [];
  let offset = start;
  while (offset < end) {
    if (++counter.value > VIDEO_PROBE_MAX_ENTRIES) return undefined;
    const element = readElement(bytes, offset, end);
    if (!element) return undefined;
    result.push(element);
    offset = element.end;
  }
  return offset === end ? result : undefined;
}

function unsigned(bytes: Uint8Array, element: Element) {
  const length = element.end - element.payloadStart;
  if (length < 1 || length > 6) return undefined;
  let value = 0;
  for (let offset = element.payloadStart; offset < element.end; offset += 1) value = value * 256 + bytes[offset];
  return Number.isSafeInteger(value) ? value : undefined;
}

function text(bytes: Uint8Array, element: Element) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(element.payloadStart, element.end));
}

function float(bytes: Uint8Array, element: Element) {
  const length = element.end - element.payloadStart;
  const view = new DataView(bytes.buffer, bytes.byteOffset + element.payloadStart, length);
  if (length === 4) return view.getFloat32(0);
  if (length === 8) return view.getFloat64(0);
  return undefined;
}

function locate(bytes: Uint8Array, signature: readonly number[], start = 0) {
  outer: for (let offset = start; offset + signature.length <= bytes.length; offset += 1) {
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[offset + index] !== signature[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function parseVideo(bytes: Uint8Array, element: Element, counter: { value: number }) {
  if (VIDEO_PROBE_MAX_DEPTH < 3) return undefined;
  const entries = children(bytes, element.payloadStart, element.end, counter);
  const widthElement = entries?.find(({ id }) => id === 0xb0);
  const heightElement = entries?.find(({ id }) => id === 0xba);
  return {
    width: widthElement ? unsigned(bytes, widthElement) : undefined,
    height: heightElement ? unsigned(bytes, heightElement) : undefined,
  };
}

function parseAudio(bytes: Uint8Array, element: Element, counter: { value: number }) {
  if (VIDEO_PROBE_MAX_DEPTH < 3) return undefined;
  const entries = children(bytes, element.payloadStart, element.end, counter);
  const sampleRateElement = entries?.find(({ id }) => id === 0xb5);
  const channelsElement = entries?.find(({ id }) => id === 0x9f);
  return {
    sampleRate: sampleRateElement ? float(bytes, sampleRateElement) : undefined,
    channels: channelsElement ? unsigned(bytes, channelsElement) : undefined,
  };
}

function parseTrack(bytes: Uint8Array, element: Element, counter: { value: number }) {
  const entries = children(bytes, element.payloadStart, element.end, counter);
  const typeElement = entries?.find(({ id }) => id === 0x83);
  if (!entries || !typeElement) return { type: "other" as const };
  const type = unsigned(bytes, typeElement);
  if (type !== 1 && type !== 2) return { type: "other" as const };
  const codecElement = entries.find(({ id }) => id === 0x86);
  if (!codecElement) return { type: "unsupported-media" as const };
  let codecId: string;
  try {
    codecId = text(bytes, codecElement);
  } catch {
    return { type: "unsupported-media" as const };
  }
  if (type === 1) {
    const video = entries.find(({ id }) => id === 0xe0);
    const dimensions = video ? parseVideo(bytes, video, counter) : undefined;
    const codec = codecId === "V_VP8" ? "VP8" : codecId === "V_VP9" ? "VP9" : codecId === "V_AV1" ? "AV1" : codecId;
    const codecString = codecId === "V_VP8" ? "vp8" : codecId === "V_VP9" ? "vp9" : codecId === "V_AV1" ? "av01" : codecId;
    return { type: "video" as const, track: { codec, codecString, ...dimensions } satisfies ParsedVideoTrack };
  }
  if (type === 2) {
    const audio = entries.find(({ id }) => id === 0xe1);
    const properties = audio ? parseAudio(bytes, audio, counter) : undefined;
    const codec = codecId === "A_OPUS" ? "Opus" : codecId === "A_VORBIS" ? "Vorbis" : codecId;
    const codecString = codecId === "A_OPUS" ? "opus" : codecId === "A_VORBIS" ? "vorbis" : codecId;
    return { type: "audio" as const, track: { codec, codecString, ...properties } satisfies ParsedAudioTrack };
  }
  return { type: "other" as const };
}

export function inspectWebm(head: Uint8Array): VideoFileInspection | undefined {
  const header = readElement(head, 0, head.length);
  if (!header || header.id !== 0x1a45dfa3) return undefined;
  const counter = { value: 0 };
  const headerChildren = children(head, header.payloadStart, header.end, counter);
  const docTypeElement = headerChildren?.find(({ id }) => id === 0x4282);
  if (!docTypeElement || text(head, docTypeElement) !== "webm") return undefined;

  const segmentOffset = locate(head, [0x18, 0x53, 0x80, 0x67], header.end);
  if (segmentOffset < 0) return undefined;
  let tracksOffset = locate(head, [0x16, 0x54, 0xae, 0x6b], segmentOffset);
  let tracks: Element | undefined;
  let trackEntries: Element[] | undefined;
  while (tracksOffset >= 0) {
    const candidate = readElement(head, tracksOffset, head.length);
    const candidateEntries = candidate?.id === 0x1654ae6b
      ? children(head, candidate.payloadStart, candidate.end, counter)?.filter(({ id }) => id === 0xae)
      : undefined;
    if (candidateEntries?.length) {
      tracks = candidate;
      trackEntries = candidateEntries;
      break;
    }
    tracksOffset = locate(head, [0x16, 0x54, 0xae, 0x6b], tracksOffset + 1);
  }
  if (!tracks || !trackEntries) return undefined;
  if (!trackEntries || trackEntries.length < 1 || trackEntries.length > VIDEO_PROBE_MAX_TRACKS) return undefined;

  const videoTracks: ParsedVideoTrack[] = [];
  const audioTracks: ParsedAudioTrack[] = [];
  let hasUnsupportedMediaTrack = false;
  for (const entry of trackEntries) {
    const parsed = parseTrack(head, entry, counter);
    if (parsed.type === "video") videoTracks.push(parsed.track);
    if (parsed.type === "audio") audioTracks.push(parsed.track);
    if (parsed.type === "unsupported-media") hasUnsupportedMediaTrack = true;
  }
  const videoCodec = videoTracks[0]?.codecString;
  const audioCodec = audioTracks[0]?.codecString;
  const codecsSupported = !hasUnsupportedMediaTrack
    && videoTracks.length === 1
    && audioTracks.length <= 1
    && ((videoCodec === "vp8" && audioCodec === "vorbis")
      || (videoCodec === "vp9" && (audioTracks.length === 0 || audioCodec === "opus")));
  return { container: "WebM", mimeType: "video/webm", videoTracks, audioTracks, codecsSupported };
}
