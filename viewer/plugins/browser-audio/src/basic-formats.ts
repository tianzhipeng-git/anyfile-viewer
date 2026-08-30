import type { AudioFileInspection } from "./types";

const MAX_TAG_BYTES = 128 * 1024;
const MAX_CHUNKS = 128;
const MP3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const SAMPLE_RATES = [44_100, 48_000, 32_000];

export class AudioProbeLimitError extends Error {}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function parseMp3Frame(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xfe) !== 0xfa) return undefined;
  const bitrate = MP3_BITRATES[(bytes[offset + 2] >> 4) & 0x0f];
  const sampleRate = SAMPLE_RATES[(bytes[offset + 2] >> 2) & 0x03];
  if (!bitrate || !sampleRate) return undefined;
  const padding = (bytes[offset + 2] >> 1) & 1;
  return {
    channels: (bytes[offset + 3] >> 6) === 3 ? 1 : 2,
    length: Math.floor(144_000 * bitrate / sampleRate) + padding,
    sampleRate,
  };
}

export function inspectMp3(bytes: Uint8Array): AudioFileInspection | undefined {
  let offset = 0;
  if (ascii(bytes, 0, 3) === "ID3") {
    if (bytes.length < 10 || bytes.subarray(6, 10).some((value) => value & 0x80)) return undefined;
    const size = bytes.slice(6, 10).reduce((total, value) => total * 128 + value, 0);
    if (size > MAX_TAG_BYTES) throw new AudioProbeLimitError("ID3 tag exceeds the audio probe limit");
    offset = 10 + size;
  }
  for (let scanned = 0; scanned < 16 && offset + 4 <= bytes.length; scanned += 1, offset += 1) {
    const first = parseMp3Frame(bytes, offset);
    if (!first) continue;
    const second = parseMp3Frame(bytes, offset + first.length);
    if (!second || second.sampleRate !== first.sampleRate || second.channels !== first.channels) continue;
    return { container: "MP3", codec: "MP3", mimeType: "audio/mpeg", channels: first.channels, sampleRate: first.sampleRate };
  }
  return undefined;
}

export function inspectWave(bytes: Uint8Array): AudioFileInspection | undefined {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return undefined;
  const declaredSize = u32le(bytes, 4) + 8;
  if (declaredSize < 44) return undefined;
  let format: number | undefined;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let hasData = false;
  let offset = 12;
  for (let count = 0; count < MAX_CHUNKS && offset + 8 <= bytes.length; count += 1) {
    const type = ascii(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const end = offset + 8 + size;
    if (!Number.isSafeInteger(end) || end > declaredSize) return undefined;
    if (type === "fmt " && size >= 16 && offset + 24 <= bytes.length) {
      format = u16le(bytes, offset + 8);
      channels = u16le(bytes, offset + 10);
      sampleRate = u32le(bytes, offset + 12);
      bitsPerSample = u16le(bytes, offset + 22);
      if (format === 0xfffe && size >= 40 && offset + 48 <= bytes.length) {
        const guidTail = [0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];
        if (!guidTail.every((value, index) => bytes[offset + 36 + index] === value)) return undefined;
        format = u16le(bytes, offset + 32);
      }
    }
    if (type === "data") {
      hasData = size > 0;
      break;
    }
    if (end > bytes.length) return undefined;
    offset = end + (size & 1);
  }
  const supported = (format === 1 && [16, 24].includes(bitsPerSample ?? 0)) || (format === 3 && bitsPerSample === 32);
  if (!supported || !hasData || !channels || channels > 2 || !sampleRate || sampleRate > 192_000) return undefined;
  return {
    container: "WAVE",
    codec: format === 3 ? "PCM F32LE" : `PCM S${bitsPerSample}LE`,
    mimeType: "audio/wav",
    channels,
    sampleRate,
    bitsPerSample,
  };
}

export function inspectFlac(bytes: Uint8Array): AudioFileInspection | undefined {
  if (ascii(bytes, 0, 4) !== "fLaC") return undefined;
  let offset = 4;
  let streamInfo: Uint8Array | undefined;
  let last = false;
  for (let count = 0; count < MAX_CHUNKS && !last; count += 1) {
    if (offset + 4 > bytes.length) return undefined;
    last = Boolean(bytes[offset] & 0x80);
    const type = bytes[offset] & 0x7f;
    const size = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (type !== 1 && size > MAX_TAG_BYTES) throw new AudioProbeLimitError("FLAC metadata block exceeds the audio probe limit");
    if (offset + 4 + size > bytes.length) return undefined;
    if (type === 0) streamInfo = bytes.subarray(offset + 4, offset + 4 + size);
    offset += 4 + size;
  }
  if (!last || streamInfo?.length !== 34 || offset >= bytes.length) return undefined;
  const sampleRate = (streamInfo[10] << 12) | (streamInfo[11] << 4) | (streamInfo[12] >> 4);
  const channels = ((streamInfo[12] >> 1) & 7) + 1;
  const bitsPerSample = ((streamInfo[12] & 1) << 4 | (streamInfo[13] >> 4)) + 1;
  const totalSamples = (streamInfo[13] & 15) * 2 ** 32
    + streamInfo[14] * 2 ** 24 + streamInfo[15] * 2 ** 16 + streamInfo[16] * 2 ** 8 + streamInfo[17];
  if (![16, 24].includes(bitsPerSample) || channels > 2 || !sampleRate || sampleRate > 192_000 || !totalSamples) return undefined;
  return { container: "FLAC", codec: "FLAC", mimeType: "audio/flac", channels, sampleRate, bitsPerSample };
}

function adtsFrame(bytes: Uint8Array, offset: number) {
  if (offset + 7 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xf6) !== 0xf0) return undefined;
  const profile = (bytes[offset + 2] >> 6) & 0x03;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x0f;
  const sampleRates = [96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350];
  const channels = ((bytes[offset + 2] & 1) << 2) | (bytes[offset + 3] >> 6);
  const length = ((bytes[offset + 3] & 3) << 11) | (bytes[offset + 4] << 3) | (bytes[offset + 5] >> 5);
  const sampleRate = sampleRates[sampleRateIndex];
  if (profile !== 1 || !sampleRate || channels < 1 || channels > 2 || length < 7) return undefined;
  return { channels, length, sampleRate };
}

export function inspectAdts(bytes: Uint8Array): AudioFileInspection | undefined {
  const first = adtsFrame(bytes, 0);
  const second = first && adtsFrame(bytes, first.length);
  if (!first || !second || first.channels !== second.channels || first.sampleRate !== second.sampleRate) return undefined;
  return { container: "ADTS", codec: "AAC-LC", mimeType: "audio/aac", channels: first.channels, sampleRate: first.sampleRate };
}
