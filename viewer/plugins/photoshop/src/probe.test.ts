import { describe, expect, it } from "vitest";

import { probePhotoshop } from "./probe";

function psdHeader() {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set([0x38, 0x42, 0x50, 0x53]);
  view.setUint16(4, 1);
  view.setUint16(12, 4);
  view.setUint32(14, 100);
  view.setUint32(18, 200);
  view.setUint16(22, 8);
  view.setUint16(24, 3);
  return bytes;
}

describe("Photoshop probe", () => {
  it("recognizes a structurally valid PSD header", async () => {
    await expect(probePhotoshop({
      file: new File([psdHeader()], "artwork.psd"),
      signal: new AbortController().signal,
    })).resolves.toBe(3);
  });

  it("rejects PSB and invalid headers", async () => {
    const psb = psdHeader();
    new DataView(psb.buffer).setUint16(4, 2);
    await expect(probePhotoshop({ file: new File([psb], "large.psd"), signal: new AbortController().signal })).resolves.toBe(0);
    await expect(probePhotoshop({ file: new File(["not psd"], "fake.psd"), signal: new AbortController().signal })).resolves.toBe(0);
  });

  it("honors cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probePhotoshop({ file: new File([psdHeader()], "artwork.psd"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
