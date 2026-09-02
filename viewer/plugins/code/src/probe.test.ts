import { describe, expect, it } from "vitest";

import { probeCode } from "./probe";

function context(content: BlobPart, name = "source.ts", signal = new AbortController().signal) {
  return { file: new File([content], name), signal };
}

describe("code probe", () => {
  it("returns main-content support for UTF-8 source and empty text files", async () => {
    await expect(probeCode(context("export const answer = 42;\n"))).resolves.toBe(3);
    await expect(probeCode(context("", "empty.txt"))).resolves.toBe(3);
  });

  it("rejects binary and invalid UTF-8 content", async () => {
    await expect(probeCode(context(Uint8Array.of(0x47, 0x00, 0x10, 0x00), "clip.ts")))
      .resolves.toBe(0);
    await expect(probeCode(context(Uint8Array.of(0xff, 0xfe, 0xfd), "binary.txt")))
      .resolves.toBe(0);
  });

  it("rejects content dominated by control characters", async () => {
    await expect(probeCode(context(Uint8Array.from({ length: 100 }, (_, index) => index % 10 === 0 ? 1 : 65))))
      .resolves.toBe(0);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeCode(context("const value = 1;", "source.ts", controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
