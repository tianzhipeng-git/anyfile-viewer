import { PlaybackClient } from "./client.mjs";
const url = "/runtime/ffmpeg-playback.worker.js";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const create = (signal) => new PlaybackClient(url, signal);

async function decode(client, video, audio) {
  let frames = 0, buffers = 0, peak = 0, end = 0;
  const first = {}, last = {}, started = performance.now();
  for (let i = 0; i < 10000; i++) {
    const event = await client.request("next");
    if (event.kind === "eof") {
      assert(!video || frames > 0, "No video frames");
      assert(!audio || buffers > 0, "No PCM");
      return { frames, buffers, peak, end, first, milliseconds: performance.now() - started };
    }
    assert(event.data.byteLength > 0 && event.data.byteLength <= 16 * 1024 * 1024, "Frame size");
    assert(Number.isFinite(event.timestamp) && Number.isFinite(event.duration) && event.duration > 0, "Frame timestamp");
    assert(last[event.kind] === undefined || event.timestamp >= last[event.kind] - 0.001, "Nonmonotonic timestamp");
    last[event.kind] = event.timestamp;
    first[event.kind] ??= performance.now() - started;
    end = Math.max(end, event.timestamp + event.duration);
    if (event.kind === "video") {
      frames++;
      const frame = new VideoFrame(event.data, { format: "I420", codedWidth: event.width, codedHeight: event.height,
        timestamp: Math.round(event.timestamp * 1e6) });
      const canvas = new OffscreenCanvas(event.width, event.height);
      canvas.getContext("2d").drawImage(frame, 0, 0); frame.close();
    } else {
      buffers++;
      const pcm = new Float32Array(event.data);
      assert(pcm.length === event.samples * event.channels, "PCM layout");
      for (const value of pcm) { assert(Number.isFinite(value), "Nonfinite PCM"); peak = Math.max(peak, Math.abs(value)); }
    }
  }
  throw new Error("Unbounded decoding");
}
window.runFixture = async (video, silent = false) => {
  const file = document.querySelector("input").files[0];
  const client = create();
  try {
    const start = performance.now();
    const info = await client.request("open", { file, video });
    const initializedMs = performance.now() - start;
    const complete = await decode(client, info.video, info.audio).catch(error => { throw new Error(`Continuous decode: ${error.message}`); });
    if (info.audio) assert(silent ? complete.peak === 0 : complete.peak > 0.001, "Unexpected PCM amplitude");
    assert(complete.end >= info.duration - 0.25, `Missing decoder drain: ${complete.end}/${info.duration}`);
    const seeks = [];
    for (const time of [2, 0.5, 3, 0]) {
      const start = performance.now();
      await client.request("seek", { time });
      const seen = new Set();
      let events = 0;
      while (events++ < 1000) {
        const event = await client.request("next").catch(error => { throw new Error(`Seek ${time}, event ${events}: ${error.message}`); });
        if (event.kind === "eof") break;
        if (event.timestamp + event.duration > time) seen.add(event.kind);
        if ((!info.video || seen.has("video")) && (!info.audio || seen.has("audio"))) break;
      }
      assert((!info.video || seen.has("video")) && (!info.audio || seen.has("audio")), "Seek did not recover all selected tracks");
      const milliseconds = performance.now() - start;
      const remaining = await decode(client, info.video, info.audio);
      assert(remaining.end >= info.duration - 0.25, "Seek playback lost decoder tail");
      seeks.push({ time, events, milliseconds, end: remaining.end });
    }
    const stats = await client.request("stats");
    await client.request("close");
    return { info, initializedMs, complete, seeks, stats };
  } finally { client.dispose(); client.dispose(); }
};
window.rejectFixture = async (video) => {
  const client = create();
  try {
    await client.request("open", { file: document.querySelector("input").files[0], video });
    await client.request("next");
    throw new Error("Unexpected success");
  } catch (error) {
    assert(error.code, error.message);
    return error.code;
  } finally { client.dispose(); }
};
window.largeFile = async (offset) => {
  const client = create();
  try {
    const value = await client.request("io-test", { file: document.querySelector("input").files[0], offset });
    assert(value === 99, `64-bit file offset truncated: ${value}`);
    return value;
  } finally { client.dispose(); }
};
window.cancelOpening = async () => {
  const controller = new AbortController(); const client = create(controller.signal);
  const promise = client.request("open", { file: document.querySelector("input").files[0], video: true });
  const start = performance.now(); controller.abort();
  try { await promise; throw new Error("Abort was ignored"); }
  catch (error) { assert(error.name === "AbortError", error.message); }
  client.dispose(); return performance.now() - start;
};
window.cancelActive = async () => {
  const client = create();
  await client.request("open", { file: document.querySelector("input").files[0], video: true });
  const promise = client.request("next");
  const start = performance.now(); client.dispose();
  try { await promise; throw new Error("Abort was ignored"); }
  catch (error) { assert(error.name === "AbortError", error.message); }
  return performance.now() - start;
};
