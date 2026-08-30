import {
  AUDIO_CODECS,
  MAX_CODED_DIMENSION,
  MAX_CODED_PIXELS,
  MAX_EBML_DEPTH,
  MAX_EBML_ELEMENTS,
  MAX_TRACKS,
  VIDEO_CODECS,
} from "./probe-limits";
import type { MatroskaInspection, ProbeTrack } from "./types";

interface Vint {
  readonly length: number;
  readonly value: number;
  readonly unknown: boolean;
}

interface Element {
  readonly id: number;
  readonly payloadStart: number;
  readonly end: number;
}

const EBML_ID = [0x1a, 0x45, 0xdf, 0xa3] as const;
const SEGMENT_ID = [0x18, 0x53, 0x80, 0x67] as const;
const TRACKS_ID = [0x16, 0x54, 0xae, 0x6b] as const;
const CUES_ID = [0x1c, 0x53, 0xbb, 0x6b] as const;

function readVint(bytes: Uint8Array, offset: number, preserveMarker: boolean): Vint | undefined {
  const first = bytes[offset];
  if (!first) return undefined;
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
  return Number.isSafeInteger(value) ? { length, value, unknown } : undefined;
}

function readElement(bytes: Uint8Array, offset: number, limit: number) {
  const id = readVint(bytes, offset, true);
  const size = id && readVint(bytes, offset + id.length, false);
  if (!id || !size || size.unknown) return undefined;
  const payloadStart = offset + id.length + size.length;
  const end = payloadStart + size.value;
  if (!Number.isSafeInteger(end) || end > limit) return undefined;
  return { id: id.value, payloadStart, end } satisfies Element;
}

function declaredElementEnd(bytes: Uint8Array, offset: number) {
  const id = readVint(bytes, offset, true);
  const size = id && readVint(bytes, offset + id.length, false);
  if (!id || !size || size.unknown) return undefined;
  const end = offset + id.length + size.length + size.value;
  return Number.isSafeInteger(end) ? end : undefined;
}

function children(bytes: Uint8Array, element: Element, counter: { value: number }) {
  const result: Element[] = [];
  let offset = element.payloadStart;
  while (offset < element.end) {
    if (++counter.value > MAX_EBML_ELEMENTS) return undefined;
    const child = readElement(bytes, offset, element.end);
    if (!child) return undefined;
    result.push(child);
    offset = child.end;
  }
  return result;
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

function unsigned(bytes: Uint8Array, element: Element) {
  const length = element.end - element.payloadStart;
  if (length < 1 || length > 6) return undefined;
  let value = 0;
  for (let offset = element.payloadStart; offset < element.end; offset += 1) {
    value = value * 256 + bytes[offset];
  }
  return Number.isSafeInteger(value) ? value : undefined;
}

function text(bytes: Uint8Array, element: Element) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(element.payloadStart, element.end));
  } catch {
    return undefined;
  }
}

function parseTrack(bytes: Uint8Array, entry: Element, counter: { value: number }): ProbeTrack | "other" | undefined {
  const fields = children(bytes, entry, counter);
  const type = fields?.find(({ id }) => id === 0x83);
  const codec = fields?.find(({ id }) => id === 0x86);
  const trackType = type && unsigned(bytes, type);
  if (!fields || !trackType) return undefined;
  if (trackType !== 1 && trackType !== 2) return "other";
  const codecId = codec && text(bytes, codec);
  if (!codecId) return undefined;

  if (trackType === 2) {
    const normalized = AUDIO_CODECS.get(codecId as never);
    return normalized ? { type: "audio", codecId, codec: normalized } : undefined;
  }

  const normalized = VIDEO_CODECS.get(codecId as never);
  const video = fields.find(({ id }) => id === 0xe0);
  if (!normalized || !video || MAX_EBML_DEPTH < 3) return undefined;
  const videoFields = children(bytes, video, counter);
  const widthElement = videoFields?.find(({ id }) => id === 0xb0);
  const heightElement = videoFields?.find(({ id }) => id === 0xba);
  const width = widthElement && unsigned(bytes, widthElement);
  const height = heightElement && unsigned(bytes, heightElement);
  if (!width || !height
    || width > MAX_CODED_DIMENSION || height > MAX_CODED_DIMENSION
    || width * height > MAX_CODED_PIXELS) return undefined;
  return { type: "video", codecId, codec: normalized, width, height };
}

function readTrackEntries(bytes: Uint8Array, start: number, counter: { value: number }) {
  let offset = locate(bytes, TRACKS_ID, start);
  while (offset >= 0) {
    const tracks = readElement(bytes, offset, bytes.length);
    const entries = tracks?.id === 0x1654ae6b
      ? children(bytes, tracks, counter)?.filter(({ id }) => id === 0xae)
      : undefined;
    if (entries?.length) return entries;
    offset = locate(bytes, TRACKS_ID, offset + 1);
  }
  return undefined;
}

function hasCues(bytes: Uint8Array, start: number, counter: { value: number }) {
  let offset = locate(bytes, CUES_ID, start);
  while (offset >= 0) {
    const cues = readElement(bytes, offset, bytes.length);
    if (cues?.id === 0x1c53bb6b && children(bytes, cues, counter)?.length) return true;
    offset = locate(bytes, CUES_ID, offset + 1);
  }
  return false;
}

export function inspectMatroskaTracks(
  head: Uint8Array,
  tail: Uint8Array | undefined,
  fileSize: number,
): MatroskaInspection | undefined {
  const header = readElement(head, 0, head.length);
  if (!header || header.id !== 0x1a45dfa3 || locate(head, EBML_ID) !== 0) return undefined;
  const counter = { value: 0 };
  const headerFields = children(head, header, counter);
  const docType = headerFields?.find(({ id }) => id === 0x4282);
  if (!docType || text(head, docType) !== "matroska") return undefined;
  const segmentStart = locate(head, SEGMENT_ID, header.end);
  if (segmentStart < 0) return undefined;
  const declaredEnd = declaredElementEnd(head, segmentStart);
  if (declaredEnd !== undefined && declaredEnd !== fileSize) return undefined;
  const entries = readTrackEntries(head, segmentStart, counter);
  if (!entries || entries.length > MAX_TRACKS) return undefined;

  const tracks: ProbeTrack[] = [];
  for (const entry of entries) {
    const track = parseTrack(head, entry, counter);
    if (!track) return undefined;
    if (track !== "other") tracks.push(track);
  }
  return {
    tracks,
    hasSeekIndex: hasCues(head, segmentStart, counter) || (tail ? hasCues(tail, 0, counter) : false),
  };
}

export function inspectMatroska(
  head: Uint8Array,
  tail: Uint8Array | undefined,
  fileSize: number,
): MatroskaInspection | undefined {
  const inspection = inspectMatroskaTracks(head, tail, fileSize);
  return inspection?.tracks.some(({ type }) => type === "video") ? inspection : undefined;
}
