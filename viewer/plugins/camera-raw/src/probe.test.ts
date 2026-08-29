import { describe, expect, it } from "vitest";
import { inspectRawHeader } from "./probe-format";
import { probeCameraRaw } from "./probe";

function tiffDng() {
  const bytes = new Uint8Array(64); const view = new DataView(bytes.buffer); bytes.set([73, 73]); view.setUint16(2, 42, true); view.setUint32(4, 8, true); view.setUint16(8, 1, true); view.setUint16(10, 50706, true); view.setUint16(12, 1, true); view.setUint32(14, 4, true); bytes.set([1, 6, 0, 0], 18); return bytes;
}

function emptyTiff(magic = 42, little = true) {
  const bytes = new Uint8Array(16); const view = new DataView(bytes.buffer); bytes.set(little ? [73, 73] : [77, 77]); view.setUint16(2, magic, little); view.setUint32(4, 8, little); view.setUint16(8, 0, little); return bytes;
}

describe("camera RAW probe", () => {
  it("recognizes DNG and returns the current level-2 preview capability", async () => {
    const bytes = tiffDng(); expect(inspectRawHeader(bytes, "sample.dng")?.format).toBe("DNG");
    expect(await probeCameraRaw({ file: new File([bytes], "sample.dng"), signal: new AbortController().signal })).toBe(2);
  });

  it("recognizes CR2, CR3 and RAF container signatures", () => {
    const cr2 = new Uint8Array(32); const cr2View = new DataView(cr2.buffer); cr2.set([73, 73]); cr2View.setUint16(2, 42, true); cr2View.setUint32(4, 16, true); cr2.set([67, 82, 2, 0], 8); cr2View.setUint16(16, 0, true); expect(inspectRawHeader(cr2, "sample.cr2")?.format).toBe("CR2");
    const cr3 = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 99, 114, 120, 32, 0, 0, 0, 0, 99, 114, 120, 32]); expect(inspectRawHeader(cr3, "sample.cr3")?.format).toBe("CR3");
    const raf = new Uint8Array(92); raf.set(new TextEncoder().encode("FUJIFILMCCD-RAW ")); expect(inspectRawHeader(raf, "sample.raf")?.format).toBe("RAF");
  });

  it("recognizes Canon CIFF and Panasonic/Leica RAW containers", () => {
    const crw = new Uint8Array(16); crw.set(new TextEncoder().encode("II")); crw.set(new TextEncoder().encode("HEAPCCDR"), 6);
    expect(inspectRawHeader(crw, "sample.crw")?.format).toBe("CRW");
    for (const [name, format] of [["sample.rwl", "RWL"], ["sample.raw", "RAW"], ["sample.rw2", "RW2"]] as const) {
      const bytes = new Uint8Array(16); const view = new DataView(bytes.buffer); bytes.set([73, 73]); view.setUint16(2, 85, true); view.setUint32(4, 8, true); view.setUint16(8, 0, true);
      expect(inspectRawHeader(bytes, name)?.format).toBe(format);
    }
  });

  it("recognizes Nikon NRW, Sony SR2/SRF and Pentax PEF TIFF containers", () => {
    for (const [name, format] of [["sample.nrw", "NRW"], ["sample.sr2", "SR2"], ["sample.srf", "SRF"]] as const) {
      expect(inspectRawHeader(emptyTiff(), name)?.format).toBe(format);
    }
    expect(inspectRawHeader(emptyTiff(42, false), "sample.pef")?.format).toBe("PEF");
  });

  it("recognizes both Olympus ORF TIFF signatures", () => {
    expect(inspectRawHeader(emptyTiff(0x5352), "sample.orf")?.format).toBe("ORF");
    expect(inspectRawHeader(emptyTiff(0x4f52), "sample.orf")?.format).toBe("ORF");
    expect(inspectRawHeader(emptyTiff(), "renamed.orf")).toBeUndefined();
  });

  it("rejects extensions with the wrong container", async () => {
    expect(await probeCameraRaw({ file: new File(["bad"], "fake.nef"), signal: new AbortController().signal })).toBe(0);
  });

  it("ignores oversized TIFF camera strings without breaking format detection", () => {
    const bytes = new Uint8Array(200_064); const view = new DataView(bytes.buffer);
    bytes.set([73, 73]); view.setUint16(2, 42, true); view.setUint32(4, 8, true); view.setUint16(8, 2, true);
    view.setUint16(10, 271, true); view.setUint16(12, 2, true); view.setUint32(14, 200_000, true); view.setUint32(18, 40, true);
    view.setUint16(22, 50706, true); view.setUint16(24, 1, true); view.setUint32(26, 4, true); bytes.set([1, 6, 0, 0], 30);
    expect(inspectRawHeader(bytes, "oversized-make.dng")).toMatchObject({ format: "DNG", make: undefined });
  });
});
