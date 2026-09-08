const MAX_CHUNKS = 128;
const WAVE_ALAW = 0x0006;
const WAVE_MULAW = 0x0007;

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

export interface WaveLawInspection {
  readonly codec: "alaw" | "ulaw";
  readonly channels: number;
  readonly sampleRate: number;
}

/** Bounded WAVE probe that only accepts A-law / μ-law (formats browser-audio rejects). */
export function inspectWaveLaw(bytes: Uint8Array): WaveLawInspection | undefined {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return undefined;
  const declaredSize = u32le(bytes, 4) + 8;
  if (declaredSize < 44) return undefined;
  let format: number | undefined;
  let channels: number | undefined;
  let sampleRate: number | undefined;
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
  if (!hasData || !channels || channels > 2 || !sampleRate || sampleRate < 8_000 || sampleRate > 192_000) {
    return undefined;
  }
  if (format === WAVE_ALAW) return { codec: "alaw", channels, sampleRate };
  if (format === WAVE_MULAW) return { codec: "ulaw", channels, sampleRate };
  return undefined;
}
