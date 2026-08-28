import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeModernRaster } from "./probe";
import { inspectModernHeader } from "./probe-format";

const signal = new AbortController().signal;
const file = (bytes: number[], name: string) => new File([new Uint8Array(bytes)], name);
const text = (value: string) => [...new TextEncoder().encode(value)];
const u16 = (value: number) => [value >>> 8, value & 0xff];
const u32 = (value: number) => [value >>> 24, value >>> 16 & 0xff, value >>> 8 & 0xff, value & 0xff];
const box = (type: string, ...parts: number[][]) => {
  const payload = parts.flat();
  return [...u32(payload.length + 8), ...text(type), ...payload];
};
const full = (version: number, ...parts: number[][]) => [version, 0, 0, 0, ...parts.flat()];

function syntheticHeif(itemTypes: string[], primary = 1, derived = new Map<number, number[]>()) {
  const infe = itemTypes.map((type, index) => box("infe", full(2, u16(index + 1), u16(0), text(type))));
  const references = [...derived].map(([from, targets]) => box("dimg", u16(from), u16(targets.length), ...targets.map(u16)));
  const codedItems = itemTypes.flatMap((type, index) => type === "hvc1" || type === "hev1" || type === "av01" ? [index + 1] : []);
  const propertyType = itemTypes.some((type) => type === "av01") ? "av1C" : "hvcC";
  const ipmaEntries = codedItems.flatMap((id) => [...u16(id), 1, 1]);
  const meta = box("meta", full(0,
    box("pitm", full(0, u16(primary))),
    box("iinf", full(0, u16(infe.length), ...infe)),
    box("iref", full(0, ...references)),
    box("iprp", box("ipco", box(propertyType)), box("ipma", full(0, u32(codedItems.length), ipmaEntries))),
  ));
  return new Uint8Array(box("ftyp", text("heic"), u32(0), text("mif1"), text("heic")).concat(meta));
}

describe("modern raster probe", () => {
  it("recognizes JPEG XL codestream and container signatures", async () => {
    expect(inspectModernHeader(new Uint8Array([0xff, 0x0a]))).toBe("JXL");
    expect(await probeModernRaster({ file: file([0xff, 0x0a], "image.jxl"), signal })).toBe(4);
    expect(inspectModernHeader(new Uint8Array([0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10]))).toBe("JXL");
  });

  it("offers an HEVC primary item without requiring native decoding", async () => {
    const bytes = await readFile(join(process.cwd(), "examples", "sample.heic"));
    const heic = new File([bytes], "image.heic");
    expect(await probeModernRaster({ file: heic, signal })).toBe(3);
  });

  it("requires the primary HEVC item to reference an hvcC property", async () => {
    const bytes = new Uint8Array(await readFile(join(process.cwd(), "examples", "sample.heic")));
    const property = new TextEncoder().encode("hvcC");
    const offset = bytes.findIndex((value, index) => property.every((part, partIndex) => bytes[index + partIndex] === part));
    expect(offset).toBeGreaterThan(0);
    bytes.set(new TextEncoder().encode("free"), offset);
    expect(inspectModernHeader(bytes)).toBeUndefined();
  });

  it("rejects AVIF and malformed files", async () => {
    expect(await probeModernRaster({ file: file([1, 2, 3], "fake.jxl"), signal })).toBe(0);
    const avif = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0]);
    expect(inspectModernHeader(avif)).toBeUndefined();
    const oversized = new Uint8Array([0xff, 0xff, 0xff, 0xff, 102, 116, 121, 112, 104, 101, 105, 99]);
    expect(inspectModernHeader(oversized)).toBeUndefined();
    const truncated = await readFile(join(process.cwd(), "examples", "truncated.heic"));
    expect(inspectModernHeader(truncated)).toBeUndefined();
  });

  it("does not read item fields across box boundaries", () => {
    const valid = syntheticHeif(["hvc1"]);
    const pitm = valid.findIndex((value, index) => text("pitm").every((part, partIndex) => valid[index + partIndex] === part));
    expect(pitm).toBeGreaterThan(0);
    valid.set(u32(12), pitm - 4);
    expect(inspectModernHeader(valid)).toBeUndefined();
  });

  it("bounds derived-image graph traversal", () => {
    const width = 32;
    const derived = new Map<number, number[]>();
    for (let layer = 0; layer < 7; layer++) {
      const targets = Array.from({ length: width }, (_, index) => (layer + 1) * width + index + 1);
      for (let index = 0; index < width; index++) derived.set(layer * width + index + 1, targets);
    }
    const types = [...Array(7 * width).fill("grid"), ...Array(width).fill("hvc1")];
    expect(inspectModernHeader(syntheticHeif(types, 1, derived))).toBeUndefined();
  });

  it("recognizes an HEVC-branded file when a leading mdat extends past the probe window", () => {
    const header = box("ftyp", text("heic"), u32(0), text("mif1"), text("heic"));
    const prefix = new Uint8Array([...header, ...u32(2 * 1024 * 1024), ...text("mdat")]);
    expect(inspectModernHeader(prefix, header.length + 2 * 1024 * 1024 + 256)).toBe("HEIC");
  });

  it("accepts a final size-zero box but rejects non-HEVC primary codecs", () => {
    const heif = syntheticHeif(["hvc1"]);
    const prefix = new Uint8Array([...heif, 0, 0, 0, 0, ...text("free")]);
    expect(inspectModernHeader(prefix, prefix.length + 128)).toBe("HEIC");
    expect(inspectModernHeader(syntheticHeif(["av01"]))).toBeUndefined();
    expect(inspectModernHeader(syntheticHeif(["jpeg"]))).toBeUndefined();
  });
});
