import { describe, expect, it, vi } from "vitest";

import { decodeEmbeddedPreview, yuv420ToRgba } from "./embedded-preview";

describe("embedded INSV preview", () => {
  it("converts the indexed I420 frame to opaque RGBA", () => {
    const rgba = yuv420ToRgba(new Uint8Array([16, 235, 81, 145, 128, 128]), 2, 2);
    expect([...rgba]).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      76, 76, 76, 255,
      150, 150, 150, 255,
    ]);
  });

  it("closes a bitmap produced after preview decoding is aborted", async () => {
    const preview = new Uint8Array(46);
    const view = new DataView(preview.buffer);
    view.setUint32(0, 1, true);
    view.setUint32(4, preview.length, true);
    view.setUint32(8, 1, true);
    view.setUint32(16, 2, true);
    view.setUint32(20, 2, true);
    preview.set([16, 16, 16, 16, 128, 128], 40);
    let resolveBitmap!: (bitmap: ImageBitmap) => void;
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((resolve) => { resolveBitmap = resolve; })));
    const controller = new AbortController();
    const decoding = decodeEmbeddedPreview(
      new File([preview], "preview.insv"),
      { offset: 0, size: preview.length, width: 2, height: 2 } as never,
      controller.signal,
      "invalid",
    );
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());

    controller.abort();
    await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
    resolveBitmap({ close } as unknown as ImageBitmap);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    vi.unstubAllGlobals();
  });
});
