import { readLas } from "./las";
import { PointSampler } from "./sampler";
async function readPoints(file: File) {
  const sampler = new PointSampler(); const pcd = file.name.toLowerCase().endsWith(".pcd");
  let body = !pcd; let fields = ["x", "y", "z"]; let expected: number | undefined; let headers = 0; let lastSent = 0;
  const emit = (done: boolean) => { const result = sampler.snapshot(); self.postMessage({ ...result, done }, { transfer: [result.positions.buffer] }); lastSent = sampler.count; };
  const line = (text: string) => {
    if (text.length > 65536) throw new RangeError("Line budget");
    text = text.trim(); if (!text || text.startsWith("#")) return;
    const tokens = text.split(/\s+/);
    if (!body) {
      if (++headers > 128) throw new Error("PCD header limit");
      const key = tokens.shift()?.toUpperCase();
      if (key === "FIELDS" || key === "FIELD") fields = tokens;
      if (key === "COUNT" && tokens.some(value => value !== "1")) throw new Error("PCD vector fields unsupported");
      if (key === "POINTS") { expected = Number(tokens[0]); if (!Number.isSafeInteger(expected) || expected < 0) throw new Error("Invalid point count"); }
      if (key === "DATA") { if (tokens[0] !== "ascii" || !["x", "y", "z"].every(key => fields.includes(key))) throw new Error("Unsupported PCD encoding"); body = true; }
      return;
    }
    if (tokens.length < 3 || (pcd && tokens.length !== fields.length)) throw new Error("Invalid point record");
    sampler.add(...["x", "y", "z"].map(key => Number(tokens[fields.indexOf(key)])) as [number, number, number]);
    if (sampler.count === 4096 || sampler.count - lastSent >= 200_000) emit(false);
  };
  const reader = file.stream().getReader(); const decoder = new TextDecoder(); let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      pending += decoder.decode(value, { stream: true });
      let start = 0; let end: number;
      while ((end = pending.indexOf("\n", start)) >= 0) { line(pending.slice(start, end)); start = end + 1; }
      pending = pending.slice(start); if (pending.length > 65536) throw new RangeError("Line budget");
    }
    pending += decoder.decode(); if (pending.trim()) line(pending);
    if (!body || !sampler.count || (expected !== undefined && sampler.count !== expected)) throw new Error("Incomplete point cloud");
    emit(true);
  } finally { await reader.cancel(); reader.releaseLock(); }
}
self.onmessage = ({ data }: MessageEvent<File>) => {
  const emit = (sampler: PointSampler, done: boolean) => {
    const result = sampler.snapshot(); self.postMessage({ ...result, done }, { transfer: [result.positions.buffer] });
  };
  const extension = data.name.split(".").pop()?.toLowerCase();
  const pending = extension === "laz" ? import("./laz").then(module => module.readLaz(data, emit))
    : extension === "las" ? readLas(data, emit) : readPoints(data);
  void pending.catch(error => self.postMessage({ error: error instanceof RangeError ? "resource-limit" : "invalid-file" }));
};
