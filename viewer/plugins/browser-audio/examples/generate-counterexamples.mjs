import { readFile, writeFile } from "node:fs/promises";

const mp3 = await readFile("mp3-cbr.mp3");
const webm = await readFile("webm-opus.webm");
await writeFile("corrupt.mp3", Buffer.from("not an mp3"));
await writeFile("truncated.mp3", mp3.subarray(0, 24));
await writeFile("disguised.mp3", webm);
await writeFile("oversized-id3.mp3", Buffer.concat([
  Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0x09, 0, 0]),
  Buffer.alloc(128 * 1024 + 1),
]));
const adts = Buffer.from(await readFile("adts-aac-lc.aac"));
adts[2] &= 0x3f;
await writeFile("adts-main-unsupported.aac", adts);
