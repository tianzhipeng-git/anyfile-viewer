import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { browserAudioViewer } from "./index";

const contexts: ViewerTestContext[] = [];
function fixture(name: string) { return new File([new Uint8Array(readFileSync(join(process.cwd(), "examples", name)))], name); }
function testContext(name = "mp3-cbr.mp3") { const result = createViewerTestContext(fixture(name)); contexts.push(result); return result; }

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:browser-audio");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    if (this.hasAttribute("src")) queueMicrotask(() => this.dispatchEvent(new Event("loadeddata")));
  });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 3 });
  Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => null });
});

afterEach(() => { for (const context of contexts.splice(0)) context.cleanup(); vi.restoreAllMocks(); });

describe("browser audio viewer lifecycle", () => {
  it("opens with native controls without autoplay and disposes idempotently", async () => {
    const context = testContext();
    const controller = await browserAudioViewer.open(context.context);
    const audio = context.container.querySelector<HTMLAudioElement>("audio");
    expect(audio).toMatchObject({ controls: true, autoplay: false, src: "blob:browser-audio" });
    expect(context.container.textContent).toContain("MP3 · MP3 · 48000 Hz · 2 ch · 3.00 s");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    await controller.dispose(); await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("cleans an opening viewer on abort", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const context = testContext("ogg-opus.opus");
    const opening = browserAudioViewer.open(context.context);
    await vi.waitFor(() => expect(context.container.querySelector("audio")).not.toBeNull());
    context.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(context.container.childElementCount).toBe(0);
  });

  it("maps native codec rejection to unsupported-environment", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
      if (this.hasAttribute("src")) queueMicrotask(() => this.dispatchEvent(new Event("error")));
    });
    Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => ({ code: 4 }) });
    const context = testContext();
    await expect(browserAudioViewer.open(context.context)).rejects.toMatchObject({ code: "unsupported-environment" });
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("classifies an oversized ID3 tag as a resource limit", async () => {
    const context = testContext("oversized-id3.mp3");
    await expect(browserAudioViewer.open(context.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
