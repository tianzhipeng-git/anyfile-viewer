import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";
import { ViewerError } from "@anyfile/viewer-protocol";

const rawMocks = vi.hoisted(() => ({
  open: vi.fn(),
  metadata: vi.fn(),
  developed: vi.fn(),
  dispose: vi.fn(),
}));
const x6Mocks = vi.hoisted(() => ({ decode: vi.fn() }));
const dualTrackMocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@anyfile/raw-decoder", () => ({
  MAX_RAW_SOURCE_BYTES: 256 * 1024 * 1024,
  RawDecoder: class {
    open = rawMocks.open;
    metadata = rawMocks.metadata;
    developed = rawMocks.developed;
    dispose = rawMocks.dispose;
  },
}));
vi.mock("./x6-dng-source", () => ({ decodeX6DeflateDng: x6Mocks.decode }));
vi.mock("./dual-track-playback", () => ({ DualTrackPlayback: { open: dualTrackMocks.open } }));

import { insta360Viewer } from "./index";
import { X3_PHOTO_PROJECTION, X3_VIDEO_PROJECTION } from "./projection";
import { modernInsvBytes, x3DngBytes, x3InsvBytes, x3LrvBytes, x3PhotoBytes } from "./test-fixtures";

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
    getUniformLocation: vi.fn((_program: unknown, name: string) => name), uniform1i: vi.fn(), uniform1f: vi.fn(),
    uniform2fv: vi.fn(), uniform4fv: vi.fn(), uniformMatrix3fv: vi.fn(), activeTexture: vi.fn(),
    texImage2D: vi.fn(), texSubImage2D: vi.fn(), getError: vi.fn(() => 0), getParameter: vi.fn(() => maximumTextureSize),
    viewport: vi.fn(), drawArrays: vi.fn(),
  };
}

function memoryWorkspace(files: readonly File[]) {
  const byName = new Map(files.map((file) => [file.name, file]));
  return {
    async open(relativePath: string) { return byName.get(relativePath) ?? null; },
    async *list() {
      for (const file of files) yield { name: file.name, relativePath: file.name, kind: "file" as const };
    },
  };
}

beforeEach(() => {
  for (const mock of Object.values(rawMocks)) mock.mockReset();
  x6Mocks.decode.mockReset();
  dualTrackMocks.open.mockReset();
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

    const viewport = context.container.querySelector<HTMLElement>('[aria-label^="360 度全景"]')!;
    viewport.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, button: 0, clientX: 100, clientY: 100 }));
    viewport.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 140, clientY: 100 }));
    await vi.waitFor(() => expect(gl.uniform1f).toHaveBeenCalledWith("uYaw", 0.2));
    expect(gl.uniform1f).toHaveBeenCalledWith("uPitch", 0);
    expect(gl.uniform1f).toHaveBeenCalledWith("uThetaMax", X3_PHOTO_PROJECTION.thetaMaxRadians);

    await controller.dispose();
    await controller.dispose();
    expect(context.container.childElementCount).toBe(0);
    expect(close[1]).toHaveBeenCalledOnce();
    expect(close[2]).toHaveBeenCalledOnce();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
  });

  it("develops, splits and renders an X3 DNG, then releases RAW and bitmap resources", async () => {
    const gl = fakeGl();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    vi.stubGlobal("crossOriginIsolated", true);
    const close = [vi.fn(), vi.fn(), vi.fn()];
    const developed = { width: 2976, height: 5952, close: close[0] };
    const lenses = [
      { width: 2976, height: 2976, close: close[1] },
      { width: 2976, height: 2976, close: close[2] },
    ];
    rawMocks.metadata.mockResolvedValue({ make: "Arashi Vision", model: "Insta360 X3", width: 2976, height: 5952 });
    rawMocks.developed.mockResolvedValue(developed);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(lenses[0]).mockResolvedValueOnce(lenses[1]));
    const context = testContext(new File([x3DngBytes()], "photo.dng"));

    const controller = await insta360Viewer.open(context.context);
    expect(rawMocks.open).toHaveBeenCalledOnce();
    expect(rawMocks.developed).toHaveBeenCalledOnce();
    expect(rawMocks.dispose).toHaveBeenCalledOnce();
    expect(close[0]).toHaveBeenCalledOnce();
    expect(context.container.textContent).toContain("2976 × 5952 · X3 RAW 照片 · 双鱼眼");
    expect(gl.texImage2D).toHaveBeenCalledTimes(2);

    await controller.dispose();
    expect(close[1]).toHaveBeenCalledOnce();
    expect(close[2]).toHaveBeenCalledOnce();
  });

  it("rejects a DNG when LibRaw metadata does not confirm the X3 layout", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeGl() as unknown as WebGLRenderingContext);
    vi.stubGlobal("crossOriginIsolated", true);
    vi.stubGlobal("createImageBitmap", vi.fn());
    rawMocks.metadata.mockResolvedValue({ make: "Arashi Vision", model: "Insta360 X4", width: 2976, height: 5952 });
    const context = testContext(new File([x3DngBytes()], "photo.dng"));

    await expect(insta360Viewer.open(context.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(rawMocks.dispose).toHaveBeenCalledOnce();
    expect(context.container.childElementCount).toBe(0);
  });

  it("develops an X6 Deflate DNG in a Worker before splitting its two lenses", async () => {
    const gl = fakeGl();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    vi.stubGlobal("crossOriginIsolated", true);
    const developed = { width: 7760, height: 3880, close: vi.fn() };
    const lenses = [
      { width: 3880, height: 3880, close: vi.fn() },
      { width: 3880, height: 3880, close: vi.fn() },
    ];
    x6Mocks.decode.mockResolvedValue(developed);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(lenses[0]).mockResolvedValueOnce(lenses[1]));
    const context = testContext(new File([x3DngBytes({ model: "Insta360 X6", width: 15520, height: 7760 })], "x6.dng"));

    const controller = await insta360Viewer.open(context.context);
    expect(x6Mocks.decode).toHaveBeenCalledWith(expect.any(File), expect.any(AbortSignal), expect.any(String));
    expect(rawMocks.open).not.toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenNthCalledWith(1, developed, 0, 0, 3880, 3880);
    expect(createImageBitmap).toHaveBeenNthCalledWith(2, developed, 3880, 0, 3880, 3880);
    await vi.waitFor(() => expect(gl.uniform1f).toHaveBeenCalledWith("uProjectionKind", 1));
    await controller.dispose();
  });

  it("opens the embedded static panorama when dual-track HEVC decoding is unavailable", async () => {
    const gl = fakeGl();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    const preview = { width: 1280, height: 640, close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(preview));
    dualTrackMocks.open.mockRejectedValue(new ViewerError("unsupported-environment", "HEVC unavailable"));
    const fixture = modernInsvBytes({ model: "X4" });
    const context = testContext(new File([fixture.bytes], "x4.insv"));

    const controller = await insta360Viewer.open(context.context);
    const status = context.container.querySelector<HTMLElement>(".anyfile-insta360-viewer__status");
    expect(status?.textContent).toBe("不支持 HEVC：当前读取已拼接全景帧");
    expect(status?.dataset.kind).toBe("notice");
    expect(status?.title).toBe(status?.textContent);
    expect(context.container.querySelector(".anyfile-insta360-viewer__controls")).toBeNull();
    await vi.waitFor(() => expect(gl.uniform1f).toHaveBeenCalledWith("uProjectionKind", 3));
    await controller.dispose();
    expect(preview.close).toHaveBeenCalledOnce();
  });

  it("disposes a dual-track playback that finishes opening after abort", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeGl() as unknown as WebGLRenderingContext);
    let resolvePlayback!: (playback: { dispose: () => Promise<void> }) => void;
    const disposePlayback = vi.fn().mockResolvedValue(undefined);
    dualTrackMocks.open.mockImplementation(() => new Promise((resolve) => { resolvePlayback = resolve; }));
    const fixture = modernInsvBytes({ model: "X5" });
    const context = testContext(new File([fixture.bytes], "x5.insv"));
    const opening = insta360Viewer.open(context.context);
    await vi.waitFor(() => expect(dualTrackMocks.open).toHaveBeenCalledOnce());

    context.abortController.abort();
    resolvePlayback({ dispose: disposePlayback });

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    expect(disposePlayback).toHaveBeenCalledOnce();
    expect(context.container.childElementCount).toBe(0);
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
    await vi.waitFor(() => expect(gl.uniform1f).toHaveBeenCalledWith("uThetaMax", X3_VIDEO_PROJECTION.thetaMaxRadians));
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

  it("opens a strict INSV pair with _00 as the only audible master", async () => {
    const gl = fakeGl();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 2880 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 2880 });
    vi.mocked(URL.createObjectURL).mockReturnValueOnce("blob:front").mockReturnValueOnce("blob:back");
    const fixture = x3InsvBytes();
    const front = new File([fixture.bytes], "VID_20230813_194503_00_713.insv");
    const back = new File([fixture.bytes], "VID_20230813_194503_10_713.insv");
    const context = testContext(back);

    const controller = await insta360Viewer.open({ ...context.context, workspace: memoryWorkspace([front, back]) });
    const videos = Array.from(context.container.querySelectorAll("video"));
    expect(videos).toHaveLength(2);
    expect(videos[0].src).toBe("blob:front");
    expect(videos[0].muted).toBe(false);
    expect(videos[1].src).toBe("blob:back");
    expect(videos[1].muted).toBe(true);
    expect(context.container.textContent).toContain("X3 高清视频 · 双文件双鱼眼");
    const seek = context.container.querySelector<HTMLInputElement>('[aria-label="视频进度"]')!;
    Object.defineProperty(videos[0], "duration", { configurable: true, value: 30 });
    Object.defineProperty(videos[1], "duration", { configurable: true, value: 29.5 });
    videos[0].dispatchEvent(new Event("durationchange"));
    expect(seek.max).toBe("29.5");
    seek.value = "12.5";
    seek.dispatchEvent(new Event("input"));
    expect(videos.map((video) => video.currentTime)).toEqual([12.5, 12.5]);
    Object.defineProperty(videos[0], "paused", { configurable: true, value: false });
    videos[0].currentTime = 5;
    videos[1].currentTime = 5.1;
    videos[0].dispatchEvent(new Event("seeked"));
    expect(videos[1].playbackRate).toBe(0.97);
    videos[1].currentTime = 5.4;
    videos[0].dispatchEvent(new Event("seeked"));
    expect(videos[1].currentTime).toBe(5);
    expect(videos[1].playbackRate).toBe(1);
    Object.defineProperty(videos[0], "paused", { configurable: true, value: true });
    context.container.querySelector<HTMLButtonElement>('[aria-label="播放"]')!.click();
    await vi.waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    Object.defineProperty(videos[1], "ended", { configurable: true, value: true });
    videos[1].dispatchEvent(new Event("ended"));
    const replay = context.container.querySelector<HTMLButtonElement>('[aria-label="重播"]')!;
    expect(replay).not.toBeNull();
    replay.click();
    await vi.waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(4));
    expect(videos.map((video) => video.currentTime)).toEqual([0, 0]);

    await controller.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(context.container.childElementCount).toBe(0);
  });

  it("tells the user to select both INSV files or open their folder when the pair is missing", async () => {
    const fixture = x3InsvBytes();
    const context = testContext(new File([fixture.bytes], "VID_20230813_194503_00_713.insv"));
    await expect(insta360Viewer.open(context.context)).rejects.toMatchObject({
      code: "missing-related-file",
      message: "请同时选择成对的 INSV 文件，或打开包含它们的整个文件夹。",
    });
    expect(context.container.childElementCount).toBe(0);
  });

  it("does not pair INSV files from different recordings", async () => {
    const fixture = x3InsvBytes();
    const front = new File([fixture.bytes], "VID_20230813_194503_00_713.insv");
    const otherBack = new File([fixture.bytes], "VID_20230813_194504_10_713.insv");
    const context = testContext(front);
    await expect(insta360Viewer.open({ ...context.context, workspace: memoryWorkspace([front, otherBack]) }))
      .rejects.toMatchObject({ code: "missing-related-file" });
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
      message: "当前浏览器缺少此全景所需的 WebGL、媒体或 RAW 解码能力。",
    });
    expect(context.container.childElementCount).toBe(0);
  });
});
