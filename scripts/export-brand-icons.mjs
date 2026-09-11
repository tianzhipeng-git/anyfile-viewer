import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }));
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("public/brand/anyfile-master.png", root));

// Export from one master so the website and directory artwork stay identical.
const png = (size) => sharp(source).resize(size, size).png().toBuffer();
for (const size of [64, 192, 512, 1024]) {
  await writeFile(new URL(`public/brand/anyfile-${size}.png`, root), await png(size));
}
await writeFile(new URL("src/app/icon.png", root), await png(48));
await writeFile(new URL("src/app/apple-icon.png", root), await png(180));

// ICO directory with PNG frames; supported by modern browsers and Windows.
const sizes = [16, 32, 48];
// Turbopack's ICO decoder requires RGBA PNG frames for 32-bit entries.
const frames = await Promise.all(sizes.map((size) =>
  sharp(source).resize(size, size).ensureAlpha().png().toBuffer(),
));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL("src/app/favicon.ico", root), Buffer.concat([header, ...frames]));
console.log(`Exported Anyfile brand icons to ${fileURLToPath(root)}`);
