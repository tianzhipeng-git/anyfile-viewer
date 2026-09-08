import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { arch, release, type } from "node:os";
import { chromium } from "playwright";

const base = process.env.FFMPEG_TEST_URL ?? "http://127.0.0.1:3147";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 780 } });
const results = [], failures = [], requests = new Set();
page.on("pageerror", error => failures.push(error.message));
page.on("request", request => requests.add(request.url()));
await page.route("https://assets.anyfile.top/**", route => route.abort());
await page.addInitScript(() => {
  window.__ffmpegTest = { contexts: [], analysers: [], workers: new Set(), sources: 0, buffers: 0, videoSamples: [] };
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
    if (image instanceof VideoFrame && document.querySelector(".anyfile-ffmpeg-player button")?.textContent === "Pause") {
      const position = Number(document.querySelector(".anyfile-ffmpeg-player__seek").value);
      window.__ffmpegTest.videoSamples.push({ timestamp: image.timestamp / 1e6, position });
    }
    return draw.call(this, image, ...args);
  };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { super(...args); if (String(args[0]).includes("ffmpeg-playback")) window.__ffmpegTest.workers.add(this); }
    terminate() { window.__ffmpegTest.workers.delete(this); super.terminate(); }
  };
  const NativeAudio = window.AudioContext;
  window.AudioContext = class extends NativeAudio {
    constructor(...args) {
      super(...args); window.__ffmpegTest.contexts.push(this);
      const gain = this.createGain.bind(this), source = this.createBufferSource.bind(this);
      this.createGain = () => {
        const node = gain(), analyser = this.createAnalyser(); analyser.fftSize = 1024;
        node.connect(analyser); window.__ffmpegTest.analysers.push(analyser); return node;
      };
      this.createBufferSource = () => { const node = source(), start = node.start.bind(node); node.start = (...args) => { window.__ffmpegTest.sources++; if (node.buffer) window.__ffmpegTest.buffers++; return start(...args); }; return node; };
    }
  };
  window.__ffmpegPeak = () => {
    const analyser = window.__ffmpegTest.analysers.at(-1); if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
    return samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  };
});
const player = page.locator(".anyfile-ffmpeg-player");
async function open(name) {
  await page.locator('input[type="file"]').setInputFiles(resolve("tools/ffmpeg-playback-build/examples", name));
  await player.waitFor();
  await page.waitForFunction(() => document.querySelector(".viewer-container")?.nextElementSibling === null);
  await page.waitForFunction(() => window.__ffmpegTest.workers.size === 1);
}
async function seek(time) { await player.getByLabel("Playback position").evaluate((input, time) => { input.value = String(time); input.dispatchEvent(new Event("input", { bubbles: true })); }, time); }
async function check(name, callback) { const start = performance.now(); await callback(); results.push({ name, milliseconds: performance.now() - start }); console.log(`PASS ${name}`); }
try {
  await page.goto(`${base}/en/view`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await check("AVI real first frame; silent open; runtime fallback", async () => {
    await open("avi-mpeg4-mp3.avi");
    assert.equal(await page.evaluate(() => window.__ffmpegTest.contexts.length), 0);
    const pixels = await player.locator("canvas").evaluate(canvas => [...canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data].some((value, i) => i % 4 !== 3 && value > 0));
    assert(pixels);
    assert([...requests].some(url => url.startsWith("https://assets.anyfile.top/vendor/ffmpeg-playback/")));
  });
  await check("AVI audible playback and pause", async () => {
    await player.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__ffmpegPeak() > 0.01);
    await page.waitForFunction(() => Number(document.querySelector('.anyfile-ffmpeg-player__seek').value) > 0.4);
    const frames = await page.evaluate(() => window.__ffmpegTest.videoSamples);
    assert(new Set(frames.map(frame => frame.timestamp)).size >= 5);
    assert(frames.every(frame => Math.abs(frame.timestamp - frame.position) < 0.15), "Canvas timestamps follow the AudioContext-driven playhead");
    await player.getByRole("button", { name: "Pause", exact: true }).click();
    const position = await player.getByLabel("Playback position").inputValue();
    await page.waitForTimeout(180);
    assert.equal(await player.getByLabel("Playback position").inputValue(), position);
    assert((await page.evaluate(() => window.__ffmpegPeak())) < 0.001);
  });
  await check("AVI forward/backward and rapid seek, volume, end, replay", async () => {
    await seek(2.2);
    await player.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__ffmpegPeak() > 0.01);
    await player.getByLabel("Volume").evaluate(input => { input.value = "0"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForTimeout(100); assert((await page.evaluate(() => window.__ffmpegPeak())) < 0.001);
    await player.getByLabel("Volume").evaluate(input => { input.value = "1"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForFunction(() => window.__ffmpegPeak() > 0.01);
    await player.getByLabel("Playback position").evaluate(input => { for (const time of [0.3, 2.8, 0.6, 1.1]) { input.value = String(time); input.dispatchEvent(new Event("input", { bubbles: true })); } });
    await page.waitForFunction(() => Number(document.querySelector('.anyfile-ffmpeg-player__seek').value) > 1.2);
    await player.getByRole("button", { name: "Replay", exact: true }).waitFor({ timeout: 10000 });
    await player.getByRole("button", { name: "Replay", exact: true }).click();
    await page.waitForFunction(() => window.__ffmpegPeak() > 0.01);
  });
  await check("Switching to AIFF closes previous audio and Worker", async () => {
    await open("aiff-s16.aiff");
    assert.equal(await page.evaluate(() => window.__ffmpegTest.contexts.at(-1).state), "closed");
    const count = await page.evaluate(() => window.__ffmpegTest.contexts.length);
    await player.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => window.__ffmpegPeak() > 0.01);
    assert.equal(await page.evaluate(() => window.__ffmpegTest.contexts.length), count + 1);
    await seek(3); await player.getByRole("button", { name: "Replay", exact: true }).waitFor({ timeout: 10000 });
    await player.getByRole("button", { name: "Replay", exact: true }).click();
    await page.waitForFunction(() => window.__ffmpegPeak() > 0.01);
  });
  for (const name of ["aiff-s24.aiff", "aifc-f32.aifc", "avi-video-only.avi", "avi-1080p.avi"]) {
    await check(`${name} playback`, async () => {
      await open(name); await player.getByRole("button", { name: "Play", exact: true }).click();
      await page.waitForFunction(() => Number(document.querySelector('.anyfile-ffmpeg-player__seek').value) > 0.4);
      if (name !== "avi-video-only.avi") await page.waitForFunction(() => window.__ffmpegPeak() > 0.01);
    });
  }
  await check("Narrow/short player keeps controls accessible", async () => {
    await page.setViewportSize({ width: 500, height: 320 });
    assert(await player.getByRole("button", { name: "Pause", exact: true }).isVisible());
    assert(await player.getByLabel("Playback position").isVisible());
    await page.screenshot({ path: "/tmp/anyfile-ffmpeg-narrow.png" });
    await page.setViewportSize({ width: 1200, height: 780 });
  });
  await check("Valid silence and corrupt PCM handling", async () => {
    await open("aiff-silence.aiff"); await player.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => Number(document.querySelector('.anyfile-ffmpeg-player__seek').value) > 0.2);
    assert.equal(await page.evaluate(() => window.__ffmpegPeak()), 0);
    await page.locator('input[type="file"]').setInputFiles(resolve("tools/ffmpeg-playback-build/examples/nonfinite-pcm.aifc"));
    await page.getByText("Unable to play this file.", { exact: true }).waitFor();
    assert.equal(await player.count(), 0);
    assert.equal(await page.evaluate(() => window.__ffmpegTest.workers.size), 0);
    assert(await page.evaluate(() => window.__ffmpegTest.contexts.every(context => context.state === "closed")));
  });
  assert.deepEqual(failures, []);
} finally {
  await mkdir("docs/videos/evidence", { recursive: true });
  await writeFile("docs/videos/evidence/ffmpeg-playback-browser.json", JSON.stringify({ date: new Date().toISOString(), browser: browser.version(), os: { type: type(), release: release(), arch: arch() }, results, failures }, null, 2) + "\n");
  await browser.close();
}
