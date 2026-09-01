import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { insta360Viewer } from "./index";
import { x3LrvBytes, x3PhotoBytes } from "./test-fixtures";

const activeContexts: ViewerTestContext[] = [];

function testContext(file: File) {
  const result = createViewerTestContext(file);
  activeContexts.push(result);
  return result;
}

function fakeGl(maximumTextureSize = 4096) {
  let id = 0;
  const object = () => ({ id: ++id });
  return {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TEXTURE_2D: 8,
    TEXTURE_MIN_FILTER: 9, TEXTURE_MAG_FILTER: 10, LINEAR: 11,
    TEXTURE_WRAP_S: 12, TEXTURE_WRAP_T: 13, CLAMP_TO_EDGE: 14,
    TEXTURE0: 15, TEXTURE1: 16, RGBA: 17, UNSIGNED_BYTE: 18,
    TRIANGLE_STRIP: 19, MAX_TEXTURE_SIZE: 20, NO_ERROR: 0, OUT_OF_MEMORY: 1285,
    createShader: vi.fn(object), shaderSource: vi.fn(), compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true), getShaderInfoLog: vi.fn(), deleteShader: vi.fn(),
    createProgram: vi.fn(object), attachShader: vi.fn(), linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true), getProgramInfoLog: vi.fn(), deleteProgram: vi.fn(),
    createBuffer: vi.fn(object), bindBuffer: vi.fn(), bufferData: vi.fn(), deleteBuffer: vi.fn(),
    createTexture: vi.fn(object), bindTexture: vi.fn(), texParameteri: vi.fn(), deleteTexture: vi.fn(),
    useProgram: vi.fn(), getAttribLocation: vi.fn(() => 0), enableVertexAttribArray: vi.fn(), vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn(object), uniform1i: vi.fn(), uniform1f: vi.fn(), activeTexture: vi.fn(),
    texImage2D: vi.fn(), getError: vi.fn(() => 0), getParameter: vi.fn(() => maximumTextureSize),
    viewport: vi.fn(), drawArrays: vi.fn(),
  };
}

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:insta360");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    if (this.hasAttribute("src")) queueMicrotask(() => {
      this.dispatchEvent(new Event("loadedmetadata"));
      this.dispatchEvent(new Event("loadeddata"));
    });
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1024 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 512 });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 30 });
  Object.defineProperty(HTMLMediaElement.prototype, "error", { configurable: true, get: () => null });
});

afterEach(() => {
  for (const context of activeContexts.splice(0)) context.cleanup();
  vi.unstubAllGlobals();
});

describe("Insta360 viewer protocol lifecycle", () => {
  it("decodes, splits and renders an X3 photo, then releases all resources", async () => {
    const gl = fakeGl();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    const close = [vi.fn(), vi.fn(), vi.fn()];
    const bitmaps = [
      { width: 5952, height: 2976, close: close[0] },
      { width: 2976, height: 2976, close: close[1] },
      { width: 2976, height: 2976, close: close[2] },
    ];
    vi.stubGlobal("createImageBitmap", vi.fn()
      .mockResolvedValueOnce(bitmaps[0])
      .mockResolvedValueOnce(bitmaps[1])
      .mockResolvedValueOnce(bitmaps[2]));
    const context = testContext(new File([x3PhotoBytes()], "photo.insp"));

    const controller = await insta360Viewer.open(context.context);
    expect(context.container.querySelector("canvas")).not.toBeNull();
    expect(context.container.textContent).toContain("5952 × 2976 · X3 照片 · 左右双鱼眼");
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);
    expect(context.progress.at(-1)?.stage).toBe("ready");
    expect(context.outside.dataset.viewerTestOutside).toBe("untouched");
    expect(close[0]).toHaveBeenCalledOnce();

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(close[1]).toHaveBeenCalledOnce();
    expect(close[2]).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  });

  it("plays X3 LRV through one audible media element and custom controls", async () => {
    const gl = fakeGl();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    const fixture = x3LrvBytes();
    const context = testContext(new File([fixture.bytes], "proxy.lrv"));

    const controller = await insta360Viewer.open(context.context);
    const video = context.container.querySelector("video")!;
    const seek = context.container.querySelector<HTMLInputElement>('[aria-label="视频进度"]')!;
    const volume = context.container.querySelector<HTMLInputElement>('[aria-label="音量"]')!;
    const play = context.container.querySelector<HTMLButtonElement>('[aria-label="播放"]')!;
    expect(video.muted).toBe(false);
    expect(video.autoplay).toBe(false);
    expect(video.src).toBe("blob:insta360");
    expect(seek.max).toBe("30");
    seek.value = "8.5";
    seek.dispatchEvent(new Event("input"));
    expect(video.currentTime).toBe(8.5);
    volume.value = "0.4";
    volume.dispatchEvent(new Event("input"));
    expect(video.volume).toBe(0.4);
    play.click();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();

    context.abortController.abort();
    expect(context.container.childElementCount).toBe(0);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    await controller.dispose();
  });

  it("maps insufficient GPU capacity to resource-limit and cleans partial image state", async () => {
    const gl = fakeGl(2048);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    const close = [vi.fn(), vi.fn(), vi.fn()];
    vi.stubGlobal("createImageBitmap", vi.fn()
      .mockResolvedValueOnce({ width: 5952, height: 2976, close: close[0] })
      .mockResolvedValueOnce({ width: 2976, height: 2976, close: close[1] })
      .mockResolvedValueOnce({ width: 2976, height: 2976, close: close[2] }));
    const context = testContext(new File([x3PhotoBytes()], "photo.insp"));

    await expect(insta360Viewer.open(context.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(context.container.childElementCount).toBe(0);
    expect(close.every((item) => item.mock.calls.length === 1)).toBe(true);
  });

  it("aborts an opening image decode immediately and closes its eventual result", async () => {
    const gl = fakeGl();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    let resolveBitmap!: (bitmap: unknown) => void;
    const pendingBitmap = new Promise((resolve) => { resolveBitmap = resolve; });
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(() => pendingBitmap));
    const context = testContext(new File([x3PhotoBytes()], "photo.insp"));
    const opening = insta360Viewer.open(context.context);
    await vi.waitFor(() => expect(context.container.querySelector("canvas")).not.toBeNull());

    context.abortController.abort();
    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(context.container.childElementCount).toBe(0);
    resolveBitmap({ width: 5952, height: 2976, close });
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it("rejects unavailable WebGL and preserves localized errors", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const context = testContext(new File([x3PhotoBytes()], "photo.insp"));
    await expect(insta360Viewer.open(context.context)).rejects.toMatchObject({
      code: "unsupported-environment",
      message: "当前浏览器缺少此全景所需的 WebGL 或媒体能力。",
    });
    expect(context.container.childElementCount).toBe(0);
  });
});
