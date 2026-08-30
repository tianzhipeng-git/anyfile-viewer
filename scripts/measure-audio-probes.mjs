import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const browserRoot = join(root, "viewer/plugins/browser-audio/examples");
const nonNativeRoot = join(root, "viewer/plugins/non-native-audio/examples");

const fixtures = [
  [browserRoot, "mp3-cbr.mp3", "mp3"],
  [browserRoot, "mp3-vbr-xing.mp3", "mp3"],
  [browserRoot, "mp3-id3-apic.mp3", "mp3"],
  [browserRoot, "wave-s16le.wav", "wave"],
  [browserRoot, "wave-s24le.wav", "wave"],
  [browserRoot, "wave-f32le.wav", "wave"],
  [browserRoot, "m4a-aac-lc.m4a", "isobmff"],
  [browserRoot, "ogg-vorbis.ogg", "ogg"],
  [browserRoot, "ogg-opus.opus", "ogg"],
  [browserRoot, "webm-opus.webm", "ebml"],
  [browserRoot, "webm-vorbis.webm", "ebml"],
  [browserRoot, "flac-16.flac", "flac"],
  [browserRoot, "flac-24.flac", "flac"],
  [browserRoot, "flac-picture.flac", "flac"],
  [browserRoot, "adts-aac-lc.aac", "adts"],
  [nonNativeRoot, "mka-opus.mka", "ebml"],
  [nonNativeRoot, "mka-vorbis.mka", "ebml"],
  [nonNativeRoot, "mka-flac.mka", "ebml"],
  [nonNativeRoot, "mka-aac.mka", "ebml"],
];

function locate(bytes, signature, start = 0) {
  return bytes.indexOf(Buffer.from(signature), start);
}

function evidence(bytes, family) {
  if (family === "mp3") {
    const id3 = bytes.subarray(0, 3).toString() === "ID3";
    const firstFrame = bytes.findIndex((value, offset) => value === 0xff && (bytes[offset + 1] & 0xfe) === 0xfa);
    return { firstFrame, headBytesNeeded: firstFrame + 4, tailBytesNeeded: 0, id3 };
  }
  if (family === "wave") {
    const data = locate(bytes, "data");
    return { headBytesNeeded: data + 8, tailBytesNeeded: 0 };
  }
  if (family === "isobmff") {
    const moovType = locate(bytes, "moov");
    const moovStart = moovType - 4;
    const moovSize = moovStart >= 0 ? bytes.readUInt32BE(moovStart) : 0;
    return { headBytesNeeded: moovStart + moovSize, tailBytesNeeded: 0, moovStart, moovSize };
  }
  if (family === "ogg") {
    const lastPage = bytes.lastIndexOf(Buffer.from("OggS"));
    return { headBytesNeeded: Math.min(bytes.length, 4096), tailBytesNeeded: bytes.length - lastPage, lastPage };
  }
  if (family === "ebml") {
    const tracks = locate(bytes, [0x16, 0x54, 0xae, 0x6b]);
    const cues = locate(bytes, [0x1c, 0x53, 0xbb, 0x6b]);
    return { headBytesNeeded: Math.max(tracks + 4, cues + 4), tailBytesNeeded: cues < 0 ? 256 * 1024 : 0, tracks, cues };
  }
  if (family === "flac") {
    let offset = 4;
    let last = false;
    while (!last && offset + 4 <= bytes.length) {
      last = Boolean(bytes[offset] & 0x80);
      const size = bytes.readUIntBE(offset + 1, 3);
      offset += 4 + size;
    }
    return { headBytesNeeded: offset + 1, tailBytesNeeded: 0, metadataBytes: offset - 4 };
  }
  return { headBytesNeeded: 14, tailBytesNeeded: 0 };
}

const results = [];
for (const [directory, name, family] of fixtures) {
  const bytes = await readFile(join(directory, name));
  results.push({
    file: basename(name),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...evidence(bytes, family),
  });
}
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  budgets: { headBytes: 256 * 1024, tailBytes: 64 * 1024, matroskaHeadBytes: 256 * 1024, matroskaTailBytes: 64 * 1024 },
  fixtures: results,
}, null, 2));
