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
  it("recognizes structurally valid PSD and PSB headers", async () => {
    await expect(probePhotoshop({
      file: new File([psdHeader()], "artwork.psd"),
      signal: new AbortController().signal,
    })).resolves.toBe(3);

    const psb = psdHeader();
    new DataView(psb.buffer).setUint16(4, 2);
    await expect(probePhotoshop({ file: new File([psb], "large.psb"), signal: new AbortController().signal })).resolves.toBe(3);
  });

  it("rejects unsupported versions and invalid headers", async () => {
    const unsupported = psdHeader();
    new DataView(unsupported.buffer).setUint16(4, 3);
    await expect(probePhotoshop({ file: new File([unsupported], "future.psb"), signal: new AbortController().signal })).resolves.toBe(0);
    await expect(probePhotoshop({ file: new File(["not psd"], "fake.psd"), signal: new AbortController().signal })).resolves.toBe(0);
  });

  it("applies the version-specific dimension limit", async () => {
    const psd = psdHeader();
    new DataView(psd.buffer).setUint32(18, 30_001);
    await expect(probePhotoshop({ file: new File([psd], "too-wide.psd"), signal: new AbortController().signal })).resolves.toBe(0);

    const psb = psdHeader();
    const psbView = new DataView(psb.buffer);
    psbView.setUint16(4, 2);
    psbView.setUint32(18, 30_001);
    await expect(probePhotoshop({ file: new File([psb], "large.psb"), signal: new AbortController().signal })).resolves.toBe(3);
  });

  it("honors cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probePhotoshop({ file: new File([psdHeader()], "artwork.psd"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
