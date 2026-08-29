import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesRoot = join(projectRoot, "viewer/plugins/browser-video/examples");
const outputPath = join(examplesRoot, "probe-measurements.json");
const requiredFixtures = [
  "3gp-avc-aac.3gp",
  "mov-avc-aac.mov",
  "mp4-aac-audio-only.mp4",
  "mp4-av1-aac.mp4",
  "mp4-avc-aac-faststart.mp4",
  "mp4-avc-aac-tail-moov.mp4",
  "mp4-avc-video-only.mp4",
  "mp4-hevc-aac.mp4",
  "ogv-theora-vorbis.ogv",
  "webm-opus-audio-only.webm",
  "webm-vp8-vorbis.webm",
  "webm-vp9-opus.webm",
  "webm-vp9-video-only.webm",
];

function asciiIndex(bytes, value) {
  return Buffer.from(bytes).indexOf(value, 0, "ascii");
}

function mp4Boxes(bytes) {
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    let headerBytes = 8;
    if (size === 1 && offset + 16 <= bytes.length) {
      size = Number(bytes.readBigUInt64BE(offset + 8));
      headerBytes = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (!Number.isSafeInteger(size) || size < headerBytes || offset + size > bytes.length) break;
    boxes.push({ type, offset, size });
    offset += size;
  }
  return boxes;
}

const names = (await readdir(examplesRoot))
  .filter((name) => /\.(?:mp4|webm|mov|ogv|3gp)$/.test(name))
  .filter((name) => !/^(?:corrupt|truncated|disguised)/.test(name))
  .sort();
if (JSON.stringify(names) !== JSON.stringify(requiredFixtures)) {
  throw new Error("Video baseline fixtures do not match the required stage 0 set");
}

const measurements = [];
for (const name of names) {
  const bytes = await readFile(join(examplesRoot, name));
  const isoBmff = /\.(?:mp4|mov|3gp)$/.test(name);
  const entry = {
    file: name,
    bytes: bytes.length,
    family: isoBmff ? "iso-bmff" : name.endsWith(".webm") ? "webm" : "ogg",
  };
  if (isoBmff) {
    entry.topLevelBoxes = mp4Boxes(bytes);
    entry.moovOffset = entry.topLevelBoxes.find((box) => box.type === "moov")?.offset ?? -1;
    entry.moovBytes = entry.topLevelBoxes.find((box) => box.type === "moov")?.size ?? -1;
  } else if (name.endsWith(".webm")) {
    entry.ebmlOffset = asciiIndex(bytes, "webm");
    entry.tracksElementOffset = Buffer.from(bytes).indexOf(Buffer.from([0x16, 0x54, 0xae, 0x6b]));
  } else {
    entry.oggCaptureOffset = asciiIndex(bytes, "OggS");
  }
  measurements.push(entry);
}

const budgets = {
  headBytes: 256 * 1024,
  tailBytes: 256 * 1024,
  totalReadBytes: 512 * 1024,
  maxNestingDepth: 12,
  maxTracks: 32,
  maxVisitedEntries: 4096,
};
for (const measurement of measurements) {
  if (measurement.family === "iso-bmff") {
    const moovInHead = measurement.moovOffset >= 0 && measurement.moovOffset + measurement.moovBytes <= budgets.headBytes;
    const moovInTail = measurement.moovOffset >= 0 && measurement.bytes - measurement.moovOffset <= budgets.tailBytes;
    if (!moovInHead && !moovInTail) throw new Error(`${measurement.file}: moov exceeds the head/tail probe budget`);
  } else if (measurement.family === "webm" && measurement.tracksElementOffset >= budgets.headBytes) {
    throw new Error(`${measurement.file}: Tracks exceeds the head probe budget`);
  } else if (measurement.family === "ogg" && measurement.oggCaptureOffset !== 0) {
    throw new Error(`${measurement.file}: missing Ogg capture pattern`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  budgets,
  maxima: {
    fixtureBytes: Math.max(...measurements.map(({ bytes }) => bytes)),
    moovBytes: Math.max(...measurements.map(({ moovBytes = -1 }) => moovBytes)),
    moovOffset: Math.max(...measurements.map(({ moovOffset = -1 }) => moovOffset)),
    webmTracksElementOffset: Math.max(...measurements.map(({ tracksElementOffset = -1 }) => tracksElementOffset)),
  },
  measurements,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Measured ${measurements.length} fixtures: max file ${report.maxima.fixtureBytes} bytes, ` +
  `max moov ${report.maxima.moovBytes} bytes at offset ${report.maxima.moovOffset}, ` +
  `max WebM Tracks offset ${report.maxima.webmTracksElementOffset}; wrote ${outputPath}`,
);
