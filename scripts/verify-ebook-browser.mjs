import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.EBOOK_TEST_URL || "http://localhost:3000";
const output = resolve("docs/ebooks/evidence");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const attacks = [],
  errors = [],
  results = [];
page.on("request", (request) => {
  if (request.url().includes("ebook.invalid")) attacks.push(request.url());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  window.__bookUrls = new Set();
  const create = URL.createObjectURL.bind(URL),
    revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    window.__bookUrls.add(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    window.__bookUrls.delete(url);
    return revoke(url);
  };
  window.__ebookAttack = 0;
});
async function check(name, run) {
  const started = performance.now();
  await run();
  results.push({ name, elapsedMs: Math.round(performance.now() - started) });
  console.log(`PASS ${name}`);
}
async function open(name, selector) {
  const started = performance.now();
  await page.locator('input[type="file"]').setInputFiles(resolve("docs/ebooks/fixtures", name));
  await page.locator(selector).waitFor();
  return Math.round(performance.now() - started);
}
async function readyFrame(title) {
  await page.waitForFunction(
    (title) =>
      Array.from(document.querySelectorAll("iframe")).some(
        (frame) => frame.title === title && frame.contentDocument?.querySelector("#start"),
      ),
    title,
  );
  return page.frameLocator(`iframe[title="${title}"]`);
}
try {
  await check("English homepage enters isolated viewer", async () => {
    await page.goto(`${base}/en`);
    const link = page.locator('a[href="/en/view"]').first();
    await link.click();
    await page.waitForURL("**/en/view");
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  });
  await check("EPUB 3 first chapter, image and routing", async () => {
    const first = await open("epub3.epub", ".anyfile-epub-reader");
    await readyFrame("c1");
    assert.match(await page.locator("body").innerText(), /EPUB reader/);
    await page.waitForFunction(
      () =>
        document.querySelector('iframe[title="c1"]').contentDocument.querySelector("img")
          .naturalWidth === 80,
    );
    results.push({ name: "EPUB first UI", elapsedMs: first });
  });
  await check("EPUB TOC, cross-chapter anchor, typography and resize", async () => {
    await page.getByLabel("Contents", { exact: true }).selectOption("3");
    await readyFrame("c4");
    await page.waitForFunction(
      () =>
        document.querySelector(".anyfile-epub-reader__viewport").scrollTop >=
        document.querySelector('iframe[title="c4"]').parentElement.offsetTop - 5,
    );
    const chapter = await readyFrame("c4");
    await chapter.getByRole("link", { name: "Chapter two anchor" }).click();
    await readyFrame("c2");
    await page.waitForFunction(
      () => document.querySelector('select[aria-label="Contents"]').value === "1",
    );
    await page.getByLabel("Font size", { exact: true }).selectOption("26");
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.getByLabel("Text width", { exact: true }).selectOption("560");
    assert.equal(
      await page
        .locator('iframe[title="c2"]')
        .evaluate((frame) => getComputedStyle(frame.contentDocument.body).fontSize),
      "26px",
    );
    await page.setViewportSize({ width: 760, height: 500 });
    await page.screenshot({ path: resolve(output, "epub-narrow.png") });
    assert.equal(
      await page
        .locator('iframe[title="c2"]')
        .evaluate((frame) => frame.contentDocument.querySelector("#p12") !== null),
      true,
    );
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  await check("EPUB 2 NCX and RTL", async () => {
    await open("epub2.epub", ".anyfile-epub-reader");
    await readyFrame("c1");
    assert.equal(await page.getByLabel("Contents", { exact: true }).locator("option").count(), 5);
    await open("rtl.epub", ".anyfile-epub-reader");
    await readyFrame("c1");
    assert.equal(
      await page.locator('iframe[title="c1"]').evaluate((frame) => frame.contentDocument.body.dir),
      "rtl",
    );
  });
  await check("Scripts, forms, popups, external URLs, CSS and host mutation blocked", async () => {
    await open("malicious.epub", ".anyfile-epub-reader");
    await readyFrame("c1");
    const state = await page.locator('iframe[title="c1"]').evaluate((frame) => {
      const doc = frame.contentDocument;
      const script = doc.createElement("script");
      script.textContent = "parent.__ebookAttack=99;fetch('https://ebook.invalid/forced-script')";
      doc.body.append(script);
      return {
        sandbox: frame.getAttribute("sandbox"),
        unsafe: doc.querySelectorAll("form,iframe,object,embed,[onerror],a[target]").length,
        remote: doc.documentElement.outerHTML.includes("ebook.invalid/image"),
      };
    });
    assert.deepEqual(state, { sandbox: "allow-same-origin", unsafe: 0, remote: false });
    assert.equal(await page.evaluate(() => window.__ebookAttack), 0);
    assert.equal(attacks.length, 0);
    await page.screenshot({ path: resolve(output, "epub-safe.png") });
  });
  await check("Embedded font and safe SVG resources", async () => {
    await open("resources.epub", ".anyfile-epub-reader");
    await readyFrame("c1");
    await page.waitForFunction(() => {
      const doc = document.querySelector('iframe[title="c1"]').contentDocument;
      return (
        doc.fonts.check("18px Abel") &&
        doc.querySelector('img[alt="Safe SVG"]').naturalWidth === 120
      );
    });
    assert.equal(
      await page
        .locator('iframe[title="c1"]')
        .evaluate((frame) => frame.contentDocument.fonts.size),
      1,
    );
  });
  await check("Missing optional image preserves readable chapter text", async () => {
    await open("missing-image.epub", ".anyfile-epub-reader");
    await readyFrame("c1");
    await page.getByRole("status").filter({ hasText: "resource is missing" }).first().waitFor();
    assert.match(await (await readyFrame("c1")).locator("body").innerText(), /Chapter 1/);
  });
  await check("EPUB local errors and protected content", async () => {
    await open("deep.epub", ".anyfile-epub-reader");
    await page.getByRole("alert").filter({ hasText: "safe reading resource limits" }).waitFor();
    await open("drm.epub", ".anyfile-epub-reader");
    await page.getByText("No decryption is attempted.", { exact: false }).waitFor();
  });
  await check("CBZ first page, cover, natural sorting, RTL spreads and keyboard", async () => {
    await open("manga.cbz", ".anyfile-comic-reader");
    await page.locator('.anyfile-comic-reader img[alt^="1 ·"]').waitFor();
    await page.getByLabel("Reading mode", { exact: true }).selectOption("double");
    assert.equal(await page.locator(".anyfile-comic-reader figure").count(), 1);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.locator('.anyfile-comic-reader img[alt^="3 ·"]').waitFor();
    const positions = await page
      .locator(".anyfile-comic-reader img")
      .evaluateAll((images) =>
        images.map((image) => ({ alt: image.alt, x: image.getBoundingClientRect().x })),
      );
    assert.match(positions[0].alt, /2\.png/);
    assert.match(positions[1].alt, /3\.png/);
    assert.ok(positions[0].x > positions[1].x);
    await page.locator(".anyfile-comic-reader__viewport").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.getByRole("spinbutton", { name: "Page", exact: true }).inputValue(),
      "4",
    );
    await page.getByLabel("Page fit", { exact: true }).selectOption("height");
    await page.getByLabel("Zoom", { exact: true }).selectOption("1.5");
    await page.screenshot({ path: resolve(output, "comic-rtl.png") });
  });
  await check("300-page CBZ is virtualized and supports jumps, scrolling and resize", async () => {
    const first = await open("hundreds.cbz", ".anyfile-comic-reader");
    await page.locator(".anyfile-comic-reader img").first().waitFor();
    assert.ok((await page.evaluate(() => window.__bookUrls.size)) <= 3);
    results.push({ name: "300-page CBZ first UI", elapsedMs: first });
    await page.getByLabel("Reading mode", { exact: true }).selectOption("continuous");
    const input = page.getByRole("spinbutton", { name: "Page", exact: true });
    await input.fill("250");
    await input.dispatchEvent("change");
    await page.locator('.anyfile-comic-reader img[alt^="250 ·"]').waitFor();
    assert.ok((await page.locator(".anyfile-comic-reader img").count()) <= 3);
    await page.setViewportSize({ width: 800, height: 450 });
    await page.getByLabel("Page fit", { exact: true }).selectOption("height");
    await page.waitForFunction(() => {
      const image = document.querySelector('.anyfile-comic-reader img[alt^="250 ·"]'),
        viewport = document.querySelector(".anyfile-comic-reader__viewport");
      return (
        image &&
        image.getBoundingClientRect().bottom > viewport.getBoundingClientRect().top &&
        image.getBoundingClientRect().top < viewport.getBoundingClientRect().bottom
      );
    });
    assert.equal(await input.inputValue(), "250");
    await page.screenshot({ path: resolve(output, "comic-narrow.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  await check("Eight-megapixel pages stay within the four-page window", async () => {
    const started = performance.now();
    await open("pixel-budget.cbz", ".anyfile-comic-reader");
    await page.locator(".anyfile-comic-reader img").first().waitFor();
    await page.getByLabel("Reading mode", { exact: true }).selectOption("double");
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.locator('.anyfile-comic-reader img[alt^="3 ·"]').waitFor();
    assert.ok((await page.evaluate(() => window.__bookUrls.size)) <= 4);
    results.push({
      name: "8MP spread decode",
      elapsedMs: Math.round(performance.now() - started),
      liveUrls: await page.evaluate(() => window.__bookUrls.size),
      jsHeapBytes: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null),
    });
  });
  await check("JPEG, PNG, GIF, WebP and AVIF use the existing image decoder", async () => {
    await open("image-formats.cbz", ".anyfile-comic-reader");
    for (let index = 1; index <= 5; index++) {
      const input = page.getByRole("spinbutton", { name: "Page", exact: true });
      await input.fill(String(index));
      await input.dispatchEvent("change");
      await page.locator(`.anyfile-comic-reader img[alt^="${index} ·"]`).waitFor();
      assert.ok(
        await page
          .locator(`.anyfile-comic-reader img[alt^="${index} ·"]`)
          .evaluate((image) => image.naturalWidth > 0),
      );
    }
  });
  await check("ZIP64 and damaged/oversized comic pages", async () => {
    await open("zip64.cbz", ".anyfile-comic-reader");
    await page.locator(".anyfile-comic-reader img").first().waitFor();
    await open("huge-pixels.cbz", ".anyfile-comic-reader");
    await page.getByRole("alert").filter({ hasText: "safe reading resource limits" }).waitFor();
    await open("damaged-image.cbz", ".anyfile-comic-reader");
    await page.getByRole("alert").filter({ hasText: "damaged" }).waitFor();
    await open("encrypted.cbz", ".anyfile-comic-reader");
    await page.getByText("Encrypted comics are not supported.", { exact: false }).waitFor();
  });
  await check("File switching releases every book URL and iframe", async () => {
    await open("epub3.epub", ".anyfile-epub-reader");
    await readyFrame("c1");
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "done.txt", mimeType: "text/plain", buffer: Buffer.from("Done") });
    await page.locator(".anyfile-epub-reader").waitFor({ state: "detached" });
    await page.waitForFunction(() => window.__bookUrls.size === 0);
    assert.equal(await page.locator("iframe").count(), 0);
    assert.equal(attacks.length, 0);
  });
  await check("Chinese homepage enters isolated viewer with localized controls", async () => {
    await page.goto(`${base}/zh-CN`);
    await page.locator('a[href="/zh-CN/view"]').first().click();
    await page.waitForURL("**/zh-CN/view");
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);
    await open("pages.cbz", ".anyfile-comic-reader");
    await page.getByRole("button", { name: "下一页", exact: true }).waitFor();
  });
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, "browser.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        base,
        results,
        attacks,
        errors,
        limits: { epubLiveChapters: 3, comicLivePages: 4 },
        heapBytes: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null),
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
