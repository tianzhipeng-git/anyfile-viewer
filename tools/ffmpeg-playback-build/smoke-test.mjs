import { createServer } from "node:http";
import { readFile, writeFile, open, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import os from "node:os";
import { execFileSync } from "node:child_process";

const recipe = dirname(fileURLToPath(import.meta.url));
const runtime = resolve(process.argv[2] ?? "/tmp/anyfile-ffmpeg-build");
execFileSync(process.execPath, [join(recipe, "verify-build.mjs"), runtime], { stdio: "inherit" });
const fixtureHashes = {};
for (const line of (await readFile(join(recipe, "examples/manifest.sha256"), "utf8")).trim().split("\n")) {
  const [expected, name] = line.split("  ");
  if (!/^[a-z0-9.-]+$/.test(name)) throw new Error("Invalid fixture filename");
  const hash = createHash("sha256").update(await readFile(join(recipe, "examples", name))).digest("hex");
  if (hash !== expected) throw new Error(`Fixture hash changed: ${name}`);
  fixtureHashes[name] = hash;
}
const reportPath = resolve(process.argv[3] ?? join(runtime, "smoke-report.json"));
const temporary = await mkdtemp(join(tmpdir(), "ffmpeg-smoke-"));
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, "http://localhost").pathname;
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'");
    if (name === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end('<!doctype html><input type="file"><script type="module" src="/smoke-page.js"></script>'); return;
    }
    const allowed = name.startsWith("/runtime/") ? join(runtime, name.slice(9)) : join(recipe, name.slice(1));
    if (!name.match(/^\/(runtime\/)?[a-z.-]+$/)) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", extname(name) === ".wasm" ? "application/wasm" : "text/javascript");
    res.end(await readFile(allowed));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", error => console.error(error));
page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
const report = { date: new Date().toISOString(), browser: browser.version(), os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, artifacts: {}, fixtureHashes, fixtures: {}, rejection: {} };
try {
  for (const name of ["ffmpeg-playback.js", "ffmpeg-playback.wasm", "ffmpeg-playback.worker.js"]) {
    const bytes = await readFile(join(runtime, name));
    report.artifacts[name] = { bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.runFixture === "function");
  const input = page.locator("input");
  for (const [name, video, silent = false] of [
    ["avi-mpeg4-mp3.avi", true], ["ps-mpeg2-ac3.vob", true], ["ps-mpeg2-mp2.mpg", true],
    ["asf-wmv2-wma2.wmv", true], ["avi-video-only.avi", true], ["aiff-s16.aiff", false],
    ["aiff-s24.aiff", false], ["aifc-f32.aifc", false], ["asf-wma1.wma", false], ["asf-wma2.wma", false], ["avi-1080p.avi", true], ["aiff-silence.aiff", false, true], ["mp3-cover.mp3", false],
  ]) {
    await input.setInputFiles(join(recipe, "examples", name));
    try { report.fixtures[name] = await page.evaluate(({ video, silent }) => window.runFixture(video, silent), { video, silent }); }
    catch (error) { report.fixtures[name] = { error: error.message }; }
    console.log(name, JSON.stringify(report.fixtures[name]));
  }
  for (const [name, video, expected] of [
    ["asf-multiple-audio.wma", false, "unsupported-media"], ["oversized.avi", true, "resource-limit"],
    ["unknown-codec.avi", true, "unsupported-media"], ["nonfinite-pcm.aifc", false, "invalid-file"],
    ["corrupt.avi", true, "invalid-file"], ["truncated.avi", true, "invalid-file"],
    ["aiff-s16.aiff", true, "unsupported-media"], ["asf-wmv2-wma2.wmv", false, "unsupported-media"],
  ]) {
    await input.setInputFiles(join(recipe, "examples", name));
    const actual = await page.evaluate(video => window.rejectFixture(video), video);
    report.rejection[`${name}:${video}`] = { expected, actual };
    if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
  await input.setInputFiles(join(recipe, "examples/avi-1080p.avi"));
  report.openingAbortMs = await page.evaluate(() => window.cancelOpening());
  report.activeAbortMs = await page.evaluate(() => window.cancelActive());
  const offset = 2 ** 32 + 17;
  const sparse = join(temporary, "large.bin");
  const file = await open(sparse, "w");
  await file.write(new Uint8Array([42]), 0, 1, 0);
  await file.write(new Uint8Array([99]), 0, 1, offset); await file.close();
  await input.setInputFiles(sparse);
  report.largeFile = { offset, value: await page.evaluate(offset => window.largeFile(offset), offset) };
  if (Object.values(report.fixtures).some(row => row.error)) process.exitCode = 1;
} finally {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(temporary, { recursive: true });
}
