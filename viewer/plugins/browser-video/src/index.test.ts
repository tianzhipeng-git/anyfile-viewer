import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createViewerTestContext,
  type ViewerTestContext,
} from "@anyfile/viewer-test";

import { browserVideoViewer } from "./index";

const activeContexts: ViewerTestContext[] = [];

function fixture(name: string) {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), "examples", name)));
  return new File([bytes], name);
}

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:browser-video");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    if (this.hasAttribute("src")) queueMicrotask(() => this.dispatchEvent(new Event("loadeddata")));
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 320 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 180 });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 2 });
  Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => null });
});

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
});

describe("browser video viewer protocol compliance", () => {
  it("opens a fixed video with native controls and releases media resources", async () => {
    const context = testContext(fixture("mp4-avc-aac-faststart.mp4"));
    const controller = await browserVideoViewer.open(context.context);
    const video = context.container.querySelector<HTMLVideoElement>("video");

    expect(video).toMatchObject({ controls: true, autoplay: false, src: "blob:browser-video" });
    expect(context.container.textContent).toContain("MP4 · AVC/H.264 · AAC-LC · 320 × 180 · 2.00 s");
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("rejects audio-only and maps a real unsupported media event", async () => {
    const audioOnly = testContext(fixture("mp4-aac-audio-only.mp4"));
    await expect(browserVideoViewer.open(audioOnly.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: "文件没有可播放的视频轨道。",
    });

    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
      if (this.hasAttribute("src")) queueMicrotask(() => this.dispatchEvent(new Event("error")));
    });
    Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => ({ code: 4 }) });
    const unsupported = testContext(fixture("mp4-hevc-aac.mp4"));
    await expect(browserVideoViewer.open(unsupported.context)).rejects.toMatchObject({
      code: "unsupported-environment",
    });
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("cleans an opening viewer when aborted", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const context = testContext(fixture("webm-vp9-opus.webm"));
    const opening = browserVideoViewer.open(context.context);
    await vi.waitFor(() => expect(context.container.querySelector("video")).not.toBeNull());
    context.abortController.abort();

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(context.container.childElementCount).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("stops and disposes an active viewer on abort", async () => {
    const context = testContext(fixture("webm-vp8-vorbis.webm"));
    const controller = await browserVideoViewer.open(context.context);

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    await controller.dispose();
  });

  it("maps a native decode failure and cleans partial DOM", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
      if (this.hasAttribute("src")) queueMicrotask(() => this.dispatchEvent(new Event("error")));
    });
    Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => ({ code: 3 }) });
    const context = testContext(fixture("mp4-avc-aac-faststart.mp4"));

    await expect(browserVideoViewer.open(context.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(context.container.childElementCount).toBe(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
