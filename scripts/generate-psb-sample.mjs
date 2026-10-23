import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../viewer/plugins/photoshop/package.json", import.meta.url));
const { writePsd } = require("ag-psd");
const width = 512;
const height = 320;
const data = new Uint8ClampedArray(width * height * 4);
const colors = [[240, 85, 78], [245, 188, 71], [66, 177, 154], [70, 130, 210], [154, 105, 200]];

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    let color = [22, 29, 44];
    if (x >= 24 && x < 488 && y >= 24 && y < 224) {
      const across = (x - 24) / 463;
      const down = (y - 24) / 199;
      color = [Math.round(40 + 190 * across), Math.round(65 + 120 * down), Math.round(210 - 95 * across)];
    } else if (x >= 24 && x < 488 && y >= 244 && y < 296) {
      color = colors[Math.min(4, Math.floor((x - 24) / (464 / 5)))];
    }
    data.set([...color, 255], (y * width + x) * 4);
  }
}

const buffer = writePsd({ width, height, imageData: { width, height, data } }, { psb: true });
if (new DataView(buffer).getUint16(4) !== 2 || buffer.byteLength >= 1024 ** 2) {
  throw new Error("Expected a PSB sample smaller than 1 MiB.");
}
const output = new URL("../public/samples/design/", import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL("color-study.psb", output), new Uint8Array(buffer));
console.log(`Created color-study.psb: ${width}×${height}, ${buffer.byteLength} bytes`);
