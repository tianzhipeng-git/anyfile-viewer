import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTrueType } from "@anyfile/viewer-rendering/fixed-layout";

import { parseColor } from "./color";
import { loadXpsDocument, loadXpsPage } from "./document";
import { deobfuscateFont } from "./font";
import { parseAbbreviatedGeometry } from "./geometry";
import { parseGlyphRun, type XpsNode } from "./model";
import { XpsPackage } from "./package";
import { extractPageText } from "./text";
import { buildXps } from "./test-fixtures";

const signal = new AbortController().signal;

function sample(name: string) {
  return new File([readFileSync(join(process.cwd(), "examples", name))], name);
}

function flatten(node: XpsNode): XpsNode[] {
  return node.kind === "canvas" ? [node, ...node.children.flatMap(flatten)] : [node];
}

describe("XPS document model", () => {
  it("reads the UTF-16 Microsoft XPS Document Writer sample with its embedded obfuscated font", async () => {
    const pkg = await XpsPackage.open(sample("testPPT.xps"), signal);
    const doc = await loadXpsDocument(pkg);
    expect(doc.pages.map((page) => page.part)).toEqual(["Documents/1/Pages/1.fpage", "Documents/1/Pages/2.fpage", "Documents/1/Pages/3.fpage"]);
    expect(doc.openXps).toBe(false);

    const page = await loadXpsPage(pkg, doc.pages[1]!.part);
    expect([page.width, page.height]).toEqual([960, 720]);
    const glyphs = flatten(page.root).filter((node) => node.kind === "glyphs");
    expect(glyphs.map((node) => node.text)).toContain("Nistala.");
    const fontKey = "Resources/48230029-18BE-6784-E14A-6C3DD62CAE72.odttf#0";
    expect([...page.fonts]).toEqual([fontKey]);

    const fontPart = fontKey.split("#")[0]!;
    const font = parseTrueType(deobfuscateFont(await pkg.bytes(fontPart, 1 << 20), fontPart));
    expect(font.unitsPerEm).toBe(2048);
    const t = font.glyphIndex("T".codePointAt(0)!);
    expect(t).toBeGreaterThan(0);
    expect(font.outline(t)).toMatch(/^M[\d.-]+ [\d.-]+.*Z$/);
    expect(font.outline(font.glyphIndex(0x20))).toBe("");

    const text = extractPageText(page, new Map([[fontKey, font]]));
    const first = text?.words.find((word) => word.text.startsWith("This is a test file"));
    // OriginX 43.2 × the 1.333 canvas transform, as a fraction of the 960px page.
    expect(first?.x).toBeCloseTo((43.2 * 1.333333333) / 960, 3);
    await pkg.close();
  });

  it("reads Ghostscript xpswrite output with mixed page sizes, strokes and TIFF image brushes", async () => {
    const pkg = await XpsPackage.open(sample("ghostscript-shapes.xps"), signal);
    const doc = await loadXpsDocument(pkg);
    expect(doc.pages).toHaveLength(2);
    const [first, second] = await Promise.all(doc.pages.map((ref) => loadXpsPage(pkg, ref.part)));
    expect([first!.width, first!.height, second!.width, second!.height]).toEqual([793, 1122, 1122, 793]);
    const paths = flatten(first!.root).filter((node) => node.kind === "path");
    expect(paths.some((node) => node.stroke?.kind === "solid" && node.strokeStyle.width > 5)).toBe(true);
    const image = paths.find((node) => node.fill?.kind === "image");
    expect(image?.fill).toMatchObject({ kind: "image", image: "Documents/1/Resources/Images/0.tif", viewbox: { width: 8, height: 8 } });
    expect([...first!.images]).toEqual(["Documents/1/Resources/Images/0.tif"]);
    await pkg.close();
  });

  it("resolves OpenXPS pieces, resource dictionaries, gradients, PathGeometry and the outline", async () => {
    const pkg = await XpsPackage.open(buildXps({ openXps: true, pieces: true }), signal);
    const doc = await loadXpsDocument(pkg);
    expect(doc.openXps).toBe(true);
    expect(doc.pages).toHaveLength(2);
    expect(doc.outline).toEqual([
      { title: "Intro", page: 0, children: [{ title: "Details", page: 1, children: [] }] },
    ]);
    const page = await loadXpsPage(pkg, doc.pages[0]!.part);
    const nodes = flatten(page.root);
    const gradient = nodes.find((node) => node.kind === "path" && node.fill?.kind === "linear");
    expect(gradient).toMatchObject({ fill: { stops: [{ offset: 0, color: "rgba(255,0,0,1)" }, { offset: 1, color: "rgba(0,0,255,0.502)" }] } });
    const figure = nodes.find((node) => node.kind === "path" && node.geometry.d.includes("A "));
    expect(figure).toMatchObject({ geometry: { fillRule: "nonzero", transform: [2, 0, 0, 2, 0, 0] } });
    expect(nodes.find((node) => node.kind === "canvas" && node.opacity === 0.5)?.transform).toEqual([1, 0, 0, 1, 10, 20]);
    await pkg.close();
  });
});

describe("XPS primitives", () => {
  it("maps Indices and UnicodeString including cluster maps and the {} escape", () => {
    expect(parseGlyphRun("Ab", ",50;12,60.5,1,-2")).toEqual([
      { index: undefined, codePoint: 0x41, advance: 50, u: 0, v: 0 },
      { index: 12, codePoint: 0x62, advance: 60.5, u: 1, v: -2 },
    ]);
    // "ffi" ligature: three characters, one glyph; remaining characters follow 1:1.
    expect(parseGlyphRun("{}office", ";(3:1)99;;").map((glyph) => [glyph.index, glyph.codePoint])).toEqual([
      [undefined, 0x6f],
      [99, 0x66],
      [undefined, 0x63],
      [undefined, 0x65],
    ]);
  });

  it("parses sRGB, scRGB and context colors and abbreviated fill rules", () => {
    expect(parseColor("#80FF0000")).toBe("rgba(255,0,0,0.502)");
    expect(parseColor("#00ff00")).toBe("rgba(0,255,0,1)");
    expect(parseColor("sc#1,0.5,0,1")).toBe("rgba(188,0,255,1)");
    expect(parseColor("ContextColor /p.icc 1,0,0,0,1")).toBe("rgba(0,0,0,1)");
    expect(parseColor("red")).toBeUndefined();
    expect(parseAbbreviatedGeometry("F1 M 0,0 L 1,1 Z")).toEqual({ d: "M 0,0 L 1,1 Z", fillRule: "nonzero", transform: undefined });
    expect(parseAbbreviatedGeometry("M 0,0 L 1,1").fillRule).toBe("evenodd");
  });
});
