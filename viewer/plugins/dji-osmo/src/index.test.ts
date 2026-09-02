import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

const playbackMocks = vi.hoisted(() => ({ open: vi.fn(), dispose: vi.fn() }));
vi.mock("./playback", () => ({ DjiOsmoPlayback: { open: playbackMocks.open } }));

import { djiOsmoViewer } from "./index";
import { djiOsmoPhotoBytes, djiOsmoVideoBytes } from "./test-fixtures";

const contexts: ViewerTestContext[] = [];

function context(file: File) {
  const value = createViewerTestContext(file);
  contexts.push(value);
  return value;
}

function fakeGl() {
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
    uniform2f: vi.fn(), activeTexture: vi.fn(), texImage2D: vi.fn(), getError: vi.fn(() => 0),
    getParameter: vi.fn(() => 8192), viewport: vi.fn(), drawArrays: vi.fn(),
  };
}

beforeEach(() => {
  playbackMocks.open.mockReset();
  playbackMocks.dispose.mockReset();
  playbackMocks.open.mockResolvedValue({ dispose: playbackMocks.dispose });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeGl() as unknown as WebGLRenderingContext);
});

afterEach(() => {
  contexts.splice(0).forEach((value) => value.cleanup());
  vi.unstubAllGlobals();
});

describe("DJI Osmo viewer lifecycle", () => {
  it("renders and disposes an equirectangular Osmo 360 photo", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 8192, height: 4096, close }));
    const test = context(new File([djiOsmoPhotoBytes()], "panorama.jpg"));
    const controller = await djiOsmoViewer.open(test.context);
    expect(test.container.querySelector(".anyfile-dji-osmo-viewer__canvas")).not.toBeNull();
    expect(test.progress.map(({ stage }) => stage)).toEqual(["reading", "decoding-image", "ready"]);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
    await controller.dispose();
    await controller.dispose();
    expect(close).toHaveBeenCalledOnce();
    expect(test.container.children).toHaveLength(0);
  });

  it("initializes and disposes dual-track video playback", async () => {
    const test = context(new File([djiOsmoVideoBytes()], "capture.osv"));
    const controller = await djiOsmoViewer.open(test.context);
    expect(playbackMocks.open).toHaveBeenCalledOnce();
    expect(test.container.querySelector('[aria-label="播放"]')).not.toBeNull();
    await controller.dispose();
    expect(playbackMocks.dispose).toHaveBeenCalledOnce();
  });

  it("rejects a lookalike file and leaves no DOM behind", async () => {
    const test = context(new File([djiOsmoPhotoBytes("Other")], "panorama.jpg"));
    await expect(djiOsmoViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(test.container.children).toHaveLength(0);
  });
});
