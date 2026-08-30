import { readFile, writeFile } from "node:fs/promises";
const opus = await readFile("mka-opus.mka");
await writeFile("corrupt.mka", Buffer.from("not matroska"));
await writeFile("truncated.mka", opus.subarray(0, 48));
