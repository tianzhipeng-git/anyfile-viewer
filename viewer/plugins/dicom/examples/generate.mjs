// Run with Node 24: node viewer/plugins/dicom/examples/generate.mjs
import { writeFile } from "node:fs/promises";
import { dicomFixture } from "../src/fixtures.ts";

const width = 128, height = 128;
const pixels = [];
for (let frame = 0; frame < 3; frame++) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.hypot(x - 64 + frame * 10, y - 64);
      pixels.push(distance < 48 ? Math.round(1500 - distance * 35) : -1000);
    }
  }
}
const mono = dicomFixture({ width, height, frames: 3, pixels, signed: true, center: 0, window: 2400 });
await writeFile(new URL("synthetic-multiframe.dcm", import.meta.url), mono);
const rgb = [];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) rgb.push(x * 2, y * 2, 255 - x * 2);
}
await writeFile(new URL("synthetic-rgb.dicom", import.meta.url), dicomFixture({ width, height, pixels: rgb, bits: 8, samples: 3, photometric: "RGB", planar: 0 }));
await writeFile(new URL("synthetic-metadata-only.dcm", import.meta.url), dicomFixture({ photometric: "PALETTE COLOR" }));
