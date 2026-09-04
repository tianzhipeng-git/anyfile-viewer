import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";

import { probePixelmatorPxd } from "./probe";

function pxdFile(entries: Record<string, Uint8Array>, name = "document.pxd") {
  const bytes = zipSync(entries, { level: 0 });
  return new File([bytes.buffer as ArrayBuffer], name);
}

describe("Pixelmator PXD probe", () => {
  it("recognizes a PXD package with metadata and a Quick Look preview", async () => {
    const file = pxdFile({
      "metadata.info": new TextEncoder().encode("SQLite format 3\0metadata"),
      "QuickLook/Thumbnail.webp": new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    });

    await expect(probePixelmatorPxd({ file, signal: new AbortController().signal })).resolves.toBe(2);
  });

  it("rejects an ordinary ZIP renamed to PXD", async () => {
    const file = pxdFile({ "readme.txt": new TextEncoder().encode("not a Pixelmator document") });

    await expect(probePixelmatorPxd({ file, signal: new AbortController().signal })).resolves.toBe(0);
  });

  it("rejects a package without an embedded preview", async () => {
    const file = pxdFile({ "metadata.info": new TextEncoder().encode("SQLite format 3\0metadata") });

    await expect(probePixelmatorPxd({ file, signal: new AbortController().signal })).resolves.toBe(0);
  });
});
