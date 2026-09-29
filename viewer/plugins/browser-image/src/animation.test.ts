import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext } from "@anyfile/viewer-test";
import { browserImageViewer } from "./index";

const decoders: MockDecoder[] = [];
let frameCount = 3;
let pendingFrame: Promise<{ image: object }> | undefined;
class MockDecoder {
  static isTypeSupported = vi.fn(async () => true);
  tracks = { ready: Promise.resolve(), selectedTrack: { animated: true, frameCount, repetitionCount: 1 } };
  completed = Promise.resolve();
  close = vi.fn();
  frameClose = vi.fn();
  decode = vi.fn(async () => pendingFrame ?? ({ image: { displayWidth: 96, displayHeight: 64, duration: 200000, close: this.frameClose } }));
  constructor(readonly options: { type: string }) { decoders.push(this); }
}
function fixture(name: string) { return new File([readFileSync(join(process.cwd(), "examples", name))], name); }
const contexts: ReturnType<typeof createViewerTestContext>[] = [];
function setup(name: string) {
  const context = createViewerTestContext(fixture(name)); contexts.push(context);
  return { ...context, context: { ...context.context, reportPreview: vi.fn(), reportInteraction: vi.fn() } };
}
beforeEach(() => {
  frameCount = 3; decoders.length = 0; pendingFrame = undefined;
  vi.stubGlobal("ImageDecoder", MockDecoder);
  vi.spyOn(window, "matchMedia").mockReturnValue(Object.assign(new EventTarget(), { matches: true }) as MediaQueryList);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { for (const c of contexts.splice(0)) c.cleanup(); vi.unstubAllGlobals(); });

describe("controlled animation integration", () => {
  it.each([["apng", "image/png"], ["gif", "image/gif"], ["webp", "image/webp"], ["avif", "image/avif"]])("opens %s as controlled frames with one decoder", async (extension, type) => {
    const c = setup(`animated.${extension}`);
    const controller = await browserImageViewer.open(c.context);
    expect(decoders[0].options.type).toBe(type);
    expect(c.container.querySelector("canvas")).not.toBeNull();
    expect(c.container.querySelector("img")).toBeNull();
    expect(c.container.textContent).toContain("帧 1 / 3");
    expect(c.container.textContent).toContain("总播放次数: 2");
    expect(c.context.reportPreview).toHaveBeenCalledWith({ outcome: "success", kind: "animation" });
    expect(c.context.reportInteraction).not.toHaveBeenCalled();
    const speed = c.container.querySelector<HTMLSelectElement>('[aria-label="速度"]')!;
    expect(speed.value).toBe("1");
    speed.value = "0.5";
    speed.dispatchEvent(new Event("change"));
    expect(c.context.reportInteraction).toHaveBeenCalledWith({ kind: "animation_control", action: "speed_change" });
    expect(c.container.textContent).toContain("200 ms");
    c.container.querySelector<HTMLButtonElement>(".anyfile-browser-image-viewer__animation button:last-of-type")!.click();
    await vi.waitFor(() => expect(c.container.textContent).toContain("帧 2 / 3"));
    expect(c.context.reportInteraction).toHaveBeenCalledWith({ kind: "animation_control", action: "next_frame" });
    c.abortController.abort(); await controller.dispose(); await controller.dispose();
    expect(decoders[0].close).toHaveBeenCalledOnce();
    expect(decoders[0].frameClose).toHaveBeenCalledTimes(2);
    expect(c.container.childElementCount).toBe(0);
  });
  it("closes the decoder when aborted during first-frame decoding and releases a late result", async () => {
    let resolve!: (frame: { image: object }) => void;
    pendingFrame = new Promise((done) => { resolve = done; });
    const c = setup("animated.gif");
    const opening = browserImageViewer.open(c.context);
    const rejected = expect(opening).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(decoders[0]?.decode).toHaveBeenCalledOnce());
    c.abortController.abort();
    const close = vi.fn();
    resolve({ image: { displayWidth: 96, displayHeight: 64, duration: 200000, close } });
    await rejected;
    expect(close).toHaveBeenCalledOnce();
    expect(decoders[0].close).toHaveBeenCalledOnce();
    expect(c.context.reportPreview).not.toHaveBeenCalled();
    expect(c.container.childElementCount).toBe(0);
  });
  it("checks total decoded pixel cost before decoding the first frame", async () => {
    frameCount = 10001;
    const c = setup("animated.gif");
    await expect(browserImageViewer.open(c.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(decoders[0].decode).not.toHaveBeenCalled();
    expect(decoders[0].close).toHaveBeenCalledOnce();
    expect(c.container.childElementCount).toBe(0);
  });
  it("rejects truncated animation data before creating a decoder", async () => {
    const c = setup("truncated.apng");
    await expect(browserImageViewer.open(c.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(decoders).toHaveLength(0);
  });
  it("rejects oversized inputs without copying the full file", async () => {
    const c = setup("animated.gif");
    Object.defineProperty(c.context.file, "size", { value: 129 * 1024 ** 2 });
    await expect(browserImageViewer.open(c.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(decoders).toHaveLength(0);
  });
});
