const localBase = new URL("./", import.meta.url).href;
const allowedBases = [localBase, "https://assets.anyfile.top/vendor/ffmpeg-playback/9.0.1-anyfile.1/"];
async function initialize(assetBase = localBase) {
  if (!allowedBases.includes(assetBase)) throw new Error("Invalid runtime source");
  const { default: createPlaybackRuntime } = await import(`${assetBase}ffmpeg-playback.js`);
  runtime = await createPlaybackRuntime();
}

let runtime;
let opened = false;
let disposed = false;
const errorCodes = { [-1]: "invalid-file", [-2]: "unsupported-media", [-3]: "resource-limit", [-4]: "unsupported-environment" };
function check(code) {
  if (code < 0) throw Object.assign(new Error(`FFmpeg bridge error ${code}`), { code: errorCodes[code] ?? "open-failed" });
  return code;
}
function closeFile() {
  if (!runtime) return;
  runtime._fp_close();
  if (opened) runtime.FS.unmount("/input");
  opened = false;
}
function frame() {
  const kind = check(runtime._fp_next());
  if (!kind) return { kind: "eof" };
  const value = (key) => runtime._fp_value(key);
  const pointer = runtime._fp_data();
  // Copy out of WASM before transfer: the single C output slot is reused on next().
  const data = runtime.HEAPU8.slice(pointer, pointer + value(0)).buffer;
  return { kind: kind === 1 ? "video" : "audio", data, timestamp: value(1), duration: value(2),
    width: value(3), height: value(4), sampleRate: value(5), channels: value(6), samples: value(7) };
}
async function dispatch(message) {
  if (disposed) throw new Error("Worker disposed");
  if (message.type === "init") {
    if (runtime) throw new Error("Already initialized");
    await initialize(message.assetBase); return null;
  }
  if (message.type === "open" || message.type === "io-test") {
    if (opened) throw new Error("One file per Worker");
    if (!runtime) await initialize();
    runtime.FS.mkdir("/input");
    // Constant virtual name: never interpret a user-controlled filename as a path.
    runtime.FS.mount(runtime.WORKERFS, { blobs: [{ name: "media", data: message.file }] }, "/input");
    opened = true;
    if (message.type === "io-test") return runtime.ccall("fp_io_test", "number", ["string", "number"], ["/input/media", message.offset]);
    check(runtime.ccall("fp_open", "number", ["string", "number"], ["/input/media", message.video ? 1 : 0]));
    return JSON.parse(runtime.UTF8ToString(runtime._fp_info()));
  }
  if (!opened) throw new Error("No open file");
  if (message.type === "next") return frame();
  if (message.type === "seek") { check(runtime._fp_seek(message.time)); return null; }
  if (message.type === "stats") return { heapBytes: runtime.HEAPU8.buffer.byteLength, readBytes: runtime._fp_value(8) };
  if (message.type === "close") { closeFile(); disposed = true; return null; }
  throw new Error("Unknown command");
}
// Commands are serialized even while WASM initialization awaits. The client allows one in flight.
let chain = Promise.resolve();
self.onmessage = ({ data }) => {
  chain = chain.then(async () => {
    try {
      const result = await dispatch(data);
      self.postMessage({ id: data.id, generation: data.generation, result }, result?.data ? [result.data] : []);
    } catch (error) {
      closeFile(); disposed = true;
      self.postMessage({ id: data.id, generation: data.generation, error: { code: error.code ?? "open-failed", message: `${data.type}: ${String(error.message ?? error)}` } });
    }
  });
};
