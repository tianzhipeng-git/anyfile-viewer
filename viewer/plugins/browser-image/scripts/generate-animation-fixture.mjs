import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";

// Original, lossless 4x4 fixture: SOURCE/OVER and NONE/PREVIOUS/BACKGROUND disposal.
function chunk(type, data) {
  const name = Buffer.from(type);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return out;
}
function pixels(width, height, rgba) {
  return deflateSync(Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgba).flat())]))));
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 6;
const actl = Buffer.alloc(8); actl.writeUInt32BE(4); actl.writeUInt32BE(2, 4);
let sequence = 0;
const chunks = [Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("acTL", actl)];
const frames = [
  [4,4,0,0,0,0,[255,0,0,255]],
  [2,2,0,0,2,1,[0,255,0,128]],
  [2,2,0,2,1,0,[0,0,255,255]],
  [2,2,2,2,0,0,[0,0,0,0]],
];
for (const [i, [w,h,x,y,dispose,blend,rgba]] of frames.entries()) {
  const control = Buffer.alloc(26);
  control.writeUInt32BE(sequence++); control.writeUInt32BE(w, 4); control.writeUInt32BE(h, 8);
  control.writeUInt32BE(x, 12); control.writeUInt32BE(y, 16);
  control.writeUInt16BE(1, 20); control.writeUInt16BE(2, 22); control[24] = dispose; control[25] = blend;
  chunks.push(chunk("fcTL", control));
  const data = pixels(w,h,rgba);
  const prefix = Buffer.alloc(4);
  if (i) { prefix.writeUInt32BE(sequence++); chunks.push(chunk("fdAT", Buffer.concat([prefix, data]))); }
  else chunks.push(chunk("IDAT", data));
}
chunks.push(chunk("IEND", Buffer.alloc(0)));
writeFileSync(new URL("../examples/disposal-finite.apng", import.meta.url), Buffer.concat(chunks));
