interface LazRuntime {
  HEAPU8: Uint8Array; _malloc(size: number): number; _free(pointer: number): void;
  LASZip: new () => { open(pointer: number, length: number): void; getCount(): number; getPointLength(): number; getPointFormat(): number; getPoint(pointer: number): void; delete(): void };
}
import { lasHeader } from "./las";
import { PointSampler } from "./sampler";
export async function readLaz(file: File, emit: (sampler: PointSampler, done: boolean) => void) {
  if (file.size > 64 * 1024 * 1024) throw new RangeError("LAZ whole-buffer limit");
  const header = lasHeader(await file.slice(0,375).arrayBuffer(), file.size, true);
  const url = `${self.location.origin}/vendor/laz-perf/0.0.7-anyfile.1/laz-perf.js`;
  const runtimeModule = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
  const runtime: LazRuntime = await runtimeModule.default({ print() {}, printErr() {} });
  let source = 0, point = 0;
  const reader = new runtime.LASZip();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    source = runtime._malloc(bytes.length); point = runtime._malloc(header.length);
    if (!source || !point) throw new RangeError("LAZ allocation failed");
    runtime.HEAPU8.set(bytes, source); reader.open(source, bytes.length);
    if (reader.getCount() !== header.count || reader.getPointLength() !== header.length || reader.getPointFormat() !== header.format) throw new Error("Inconsistent LAZ metadata");
    const sampler = new PointSampler(); let lastSent = 0;
    for (let index = 0; index < header.count; index++) {
      reader.getPoint(point);
      const view = new DataView(runtime.HEAPU8.buffer, point, header.length);
      sampler.add(...header.scales.map((scale, axis) => view.getInt32(axis * 4, true) * scale + header.offsets[axis]) as [number,number,number]);
      if (sampler.count === 4096 || sampler.count - lastSent >= 200_000) { emit(sampler, false); lastSent = sampler.count; }
    }
    emit(sampler, true);
  } finally { reader.delete(); if (point) runtime._free(point); if (source) runtime._free(source); }
}
