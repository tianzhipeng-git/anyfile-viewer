import { describe, expect, it, vi } from "vitest";

import { decodeX6DeflateDng } from "./x6-dng-source";

describe("X6 DNG Worker lifecycle", () => {
  it("rejects an already-aborted decode without constructing a Worker", async () => {
    const worker = vi.fn();
    vi.stubGlobal("Worker", worker);
    vi.stubGlobal("DecompressionStream", class DecompressionStream {});
    const controller = new AbortController();
    controller.abort();

    await expect(decodeX6DeflateDng(new File([], "x6.dng"), controller.signal, "failed"))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(worker).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
