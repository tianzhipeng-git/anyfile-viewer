// Runs the unmodified production Worker-targeted WASM in Node for terminal-only
// decode comparisons. FileReaderSync is adapted to bounded, read-only fs reads;
// this measures decoding, not browser rendering or audio scheduling.
import assert from "node:assert/strict";
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { cpus } from "node:os";
import { isMainThread, Worker } from "node:worker_threads";
import { once } from "node:events";

// WORKERFS requires a Worker context, including in Emscripten's Node environment.
if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url), { argv: process.argv.slice(2) });
  const [code] = await once(worker, "exit");
  process.exitCode = code;
} else {

const [directory, filename, mode = "panorama", count = "30", start = "0"] = process.argv.slice(2);
if (!directory || !filename) throw new Error("Usage: node measure-node.mjs RUNTIME FILE [panorama|video|audio] [video-frame-pairs|0-for-EOF] [seek-seconds]");
const modes = { panorama: 2, video: 1, audio: 0 };
assert(Object.hasOwn(modes, mode));
const frameLimit = Number(count), seekTime = Number(start);
assert(Number.isInteger(frameLimit) && frameLimit >= 0 && Number.isFinite(seekTime) && seekTime >= 0);
const descriptor = openSync(filename, "r"), size = fstatSync(descriptor).size;
let readBytes = 0, maxRead = 0;
globalThis.FileReaderSync = class {
  readAsArrayBuffer({ start, end }) {
    assert(start >= 0 && end >= start && end <= size, JSON.stringify({ start, end, size }));
    const output = new Uint8Array(end - start);
    const read = readSync(descriptor, output, 0, output.length, start);
    assert.equal(read, output.length);
    readBytes += read; maxRead = Math.max(maxRead, read);
    return output.buffer;
  }
};
const blob = { size, slice: (start, end) => ({ start, end: Math.min(end, size), size: Math.min(end, size) - start }) };
const root = resolve(directory), initStart = performance.now();
let runtime;
try {
  const { default: createRuntime } = await import(pathToFileURL(join(root, "ffmpeg-playback.js")).href);
  const wasmModule = new WebAssembly.Module(readFileSync(join(root, "ffmpeg-playback.wasm")));
  runtime = await createRuntime({ instantiateWasm(imports, receive) { const instance = new WebAssembly.Instance(wasmModule, imports); receive(instance, wasmModule); return instance.exports; } });
  const initMs = performance.now() - initStart;
  runtime.FS.mkdir("/input"); runtime.FS.mount(runtime.WORKERFS, { blobs: [{ name: "media", data: blob }] }, "/input");
  const openStart = performance.now();
  const opened = runtime.ccall("fp_open", "number", ["string", "number"], ["/input/media", modes[mode]]);
  assert.equal(opened, 0, `open failed: ${opened}`);
  const info = JSON.parse(runtime.UTF8ToString(runtime._fp_info()));
  const openMs = performance.now() - openStart;
  if (seekTime) assert.equal(runtime._fp_seek(seekTime), 0, "seek failed");
  const hashes = [createHash("sha256"), createHash("sha256"), createHash("sha256")];
  const prefixHashes = hashes.map(() => createHash("sha256"));
  const timelineHashes = hashes.map(() => createHash("sha256"));
  const counts = [0, 0, 0], first = [null, null, null], last = [null, null, null];
  const cpu = process.cpuUsage(), started = performance.now();
  let decodeMs = 0, eof = false, pcmPeak = 0;
  for (let work = 0; work < 1000000; work++) {
    const t = performance.now(), kind = runtime._fp_next(); decodeMs += performance.now() - t;
    assert(kind >= 0, `decode failed: ${kind}`);
    if (!kind) { eof = true; break; }
    assert([1, 2, 4].includes(kind));
    const timestamp = runtime._fp_value(1), duration = runtime._fp_value(2);
    if (timestamp + duration <= seekTime) continue;
    const slot = kind === 1 ? 0 : kind === 4 ? 1 : 2;
    const heap = runtime.wasmMemory?.buffer ?? runtime.HEAPU8.buffer;
    const data = new Uint8Array(heap, runtime._fp_data(), runtime._fp_value(0)).slice();
    assert(Number.isFinite(timestamp) && duration > 0 && data.length > 0);
    assert(last[slot] === null || timestamp >= last[slot] - 0.001);
    if (kind === 2) for (const sample of new Float32Array(data.buffer)) { assert(Number.isFinite(sample)); pcmPeak = Math.max(pcmPeak, Math.abs(sample)); }
    counts[slot]++; first[slot] ??= timestamp; last[slot] = timestamp;
    hashes[slot].update(data);
    timelineHashes[slot].update(JSON.stringify([timestamp, duration]));
    if (!frameLimit || counts[slot] <= frameLimit) prefixHashes[slot].update(data);
    if (frameLimit && (mode === "panorama" ? counts[0] >= frameLimit && counts[1] >= frameLimit && counts[2] >= frameLimit : mode === "video" ? counts[0] >= frameLimit : counts[2] >= frameLimit)) break;
  }
  const wallMs = performance.now() - started, used = process.cpuUsage(cpu);
  console.log(JSON.stringify({ node: process.version, cpu: cpus()[0]?.model, mode, info, initMs, openMs, decodeMs, wallMs,
    cpuMs: (used.user + used.system) / 1000, peakRssKiB: process.resourceUsage().maxRSS,
    sharedMemory: (runtime.wasmMemory?.buffer ?? runtime.HEAPU8.buffer) instanceof SharedArrayBuffer,
    decoderWorkers: Object.keys(runtime.PThread?.pthreads ?? {}).length, counts, first, last, eof, pcmPeak,
    hashes: hashes.map(hash => hash.digest("hex")),
    prefixHashes: prefixHashes.map(hash => hash.digest("hex")), timelineHashes: timelineHashes.map(hash => hash.digest("hex")), heapBytes: (runtime.wasmMemory?.buffer ?? runtime.HEAPU8.buffer).byteLength, readBytes, maxRead }, null, 2));
} finally {
  runtime?._fp_close();
  const activeWorkers = Object.keys(runtime?.PThread?.pthreads ?? {}).length;
  runtime?.PThread?.terminateAllThreads(); closeSync(descriptor); delete globalThis.FileReaderSync;
  assert.equal(activeWorkers, 0, "Closing the decoder must join every pthread");
}

}
