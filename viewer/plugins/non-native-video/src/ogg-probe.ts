export interface OggInspection {
  readonly audioCodec: "vorbis" | "opus" | null;
}

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function inspectOgg(bytes: Uint8Array): OggInspection | undefined {
  const streams = new Map<number, Uint8Array>();
  let offset = 0;
  while (offset + 27 <= bytes.length && streams.size <= 8) {
    if (!matches(bytes, offset, [0x4f, 0x67, 0x67, 0x53]) || bytes[offset + 4] !== 0) return undefined;
    const segmentCount = bytes[offset + 26];
    if (offset + 27 + segmentCount > bytes.length) return undefined;
    let bodyBytes = 0;
    for (let index = 0; index < segmentCount; index += 1) bodyBytes += bytes[offset + 27 + index];
    const bodyStart = offset + 27 + segmentCount;
    if (bodyStart + bodyBytes > bytes.length) return undefined;
    const serial = bytes[offset + 14] | (bytes[offset + 15] << 8) | (bytes[offset + 16] << 16) | (bytes[offset + 17] << 24);
    const beginningOfStream = Boolean(bytes[offset + 5] & 0x02);
    if (!beginningOfStream && streams.size) break;
    if (beginningOfStream && !streams.has(serial)) {
      let packetBytes = 0;
      for (let index = 0; index < segmentCount; index += 1) {
        const length = bytes[offset + 27 + index];
        packetBytes += length;
        if (length < 255) break;
      }
      if (packetBytes > 0 && packetBytes <= bodyBytes) streams.set(serial, bytes.subarray(bodyStart, bodyStart + packetBytes));
    }
    offset = bodyStart + bodyBytes;
  }
  const packets = [...streams.values()];
  const videos = packets.filter((packet) => matches(packet, 0, [0x80, 0x74, 0x68, 0x65, 0x6f, 0x72, 0x61]));
  const audio = packets.filter((packet) => matches(packet, 0, [0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73])
    || matches(packet, 0, [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]));
  if (videos.length !== 1 || audio.length > 1) return undefined;
  return { audioCodec: !audio.length ? null : audio[0][0] === 0x01 ? "vorbis" : "opus" };
}
