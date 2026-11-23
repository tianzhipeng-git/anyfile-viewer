import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { colorToCss } from "./color";
import { loadOfdDocument } from "./document";
import { abbreviatedToSvg } from "./geometry";
import { OFD_LIMITS } from "./limits";
import { expandDeltas, loadOfdPage, type OfdNode } from "./model";
import { OfdLimitError, OfdPackage } from "./package";
import { extractSealPicture } from "./seal";
import { buildOfd } from "./test-fixtures";
import { extractPageText } from "./text";

const signal = new AbortController().signal;
const packages: OfdPackage[] = [];

async function open(file: File) {
  const pkg = await OfdPackage.open(file, signal);
  packages.push(pkg);
  return loadOfdDocument(pkg);
}

function sample(name: string) {
  return new File([readFileSync(join(process.cwd(), "examples", name))], name);
}

function flatten(node: OfdNode): OfdNode[] {
  return node.kind === "group" ? [node, ...node.children.flatMap(flatten)] : [node];
}

afterEach(async () => {
  for (const pkg of packages.splice(0)) await pkg.close();
});

describe("OFD syntax helpers", () => {
  it("converts abbreviated path data, delta arrays and colours", () => {
    expect(abbreviatedToSvg("S 0 0 L 10 0 B 1 2 3 4 5 6 Q 1 1 2 2 A 5 5 0 0 1 9 9 C")).toBe("M0 0 L10 0 C1 2 3 4 5 6 Q1 1 2 2 A5 5 0 0 1 9 9 Z");
    expect(abbreviatedToSvg("L 1 2 L 3")).toBe("M0 0 L1 2");
    expect(expandDeltas("g 3 1.5 2 g 1 4")).toEqual([1.5, 1.5, 1.5, 2, 4]);
    const element = (attrs: string) => new DOMParser().parseFromString(`<C ${attrs}/>`, "application/xml").documentElement;
    expect(colorToCss(element('Value="#FF 0 0" Alpha="51"'), undefined)).toBe("rgba(255,0,0,0.2)");
    expect(colorToCss(element('Value="0 0 0 255"'), { type: "CMYK", bits: 8, palette: [] })).toBe("rgba(0,0,0,1)");
    expect(colorToCss(element('Index="1"'), { type: "RGB", bits: 8, palette: [[0, 0, 0], [1, 2, 3]] })).toBe("rgba(1,2,3,1)");
  });
});

describe("OFD document model", () => {
  it("reads a real e-invoice: page area, template, QR image, annotations and nested-OFD seal", async () => {
    const doc = await open(sample("invoice-sample.ofd"));
    expect(doc.pages).toHaveLength(1);
    const page = await loadOfdPage(doc, 0);
    expect([page.width, page.height]).toEqual([210, 140]);
    expect([...page.images]).toEqual(["Doc_0/Res/qr.png"]);
    expect(page.seals.size).toBe(1);
    const nodes = flatten(page.root);
    expect(nodes.filter((node) => node.kind === "path").length).toBeGreaterThan(20); // template rules
    const stamp = nodes.find((node) => node.kind === "stamp");
    expect(stamp).toMatchObject({ offset: [90, 8], width: 30, height: 20 });
    const words = extractPageText(page)!.words.map((word) => word.text);
    expect(words).toEqual(expect.arrayContaining(["科游迈利有限公司", "北京市海淀区颐和园西路一亩园11号", "050001700111"]));

    const [source] = (doc.stamps.get("1") ?? [])[0]!.sources;
    expect(extractSealPicture(await doc.pkg.bytes(source!, 1 << 20))?.kind).toBe("ofd");
  });

  it("finds the PNG stamp of an SES V4 signature", async () => {
    const doc = await open(sample("ses-v4-seal.ofd"));
    const [stamp] = doc.stamps.get("1") ?? [];
    const picture = extractSealPicture(await doc.pkg.bytes(stamp!.sources[0]!, 1 << 20));
    expect(picture).toMatchObject({ kind: "image", type: "image/png" });
  });

  it("reads embedded TrueType fonts, CGTransform ligature clusters and the outline", async () => {
    const doc = await open(sample("embedded-font-outline.ofd"));
    expect(doc.pages).toHaveLength(4);
    expect(doc.outline[0]).toMatchObject({ title: "11.4字型变换", page: 0 });
    expect([...(await loadOfdPage(doc, 0)).fonts]).toEqual(["Doc_0/Res/font1.ttf"]);
    const texts = flatten((await loadOfdPage(doc, 1)).root).flatMap((node) => (node.kind === "text" ? [node] : []));
    const ligature = texts.flatMap((node) => node.glyphs).find((glyph) => glyph.index === 191);
    expect(ligature?.text).toBe("fi"); // "Heaffixed": CodePosition 4 covers "fi"
  });

  it("expands composite units and clip areas", async () => {
    const page = await loadOfdPage(await open(sample("composite-clip.ofd")), 0);
    const nodes = flatten(page.root);
    expect(nodes.some((node) => node.clips?.length)).toBe(true);
    expect(nodes.some((node) => node.kind === "group" && node.ctm)).toBe(true);
  });

  it("resolves DrawParam chains, shadings, CDATA text clusters and composites", async () => {
    const doc = await open(buildOfd());
    expect(doc.outline).toEqual([{ title: "Cover", page: 0, children: [{ title: "Body", page: 1, children: [] }] }]);
    const page = await loadOfdPage(doc, 0);
    const nodes = flatten(page.root);
    const shaded = nodes.find((node) => node.kind === "path" && node.fill);
    expect(shaded).toMatchObject({ fill: { kind: "axial", stops: [{ offset: 0 }, { offset: 1 }] }, d: "M0 0 L20 0 C20 10 10 20 0 20 Z" });
    const clipped = nodes.find((node) => node.clips);
    expect(clipped).toMatchObject({ kind: "path", line: { width: 2, cap: "round" }, stroke: { color: "rgba(0,128,0,1)" } });
    expect(clipped!.clips![0]!.transform).toEqual([1, 0, 0, 1, 5, 5]);
    const text = nodes.find((node) => node.kind === "text");
    expect(text).toMatchObject({ bold: true, alpha: 128 / 255 });
    expect(text?.kind === "text" && text.glyphs).toEqual([
      { text: "a", x: 1, y: 4 },
      { text: "<f", index: 42, x: 4, y: 4 },
      { text: "i", x: 7, y: 4 },
    ]);
    const composite = nodes.filter((node) => node.kind === "path" && node.stroke && "color" in node.stroke && node.stroke.color === "rgba(128,128,128,1)");
    expect(composite).toHaveLength(1);
  });

  it("enforces nesting and object budgets", async () => {
    const deep = `${"<ofd:PageBlock>".repeat(40)}${"</ofd:PageBlock>".repeat(40)}`;
    const doc = await open(buildOfd({ overrides: { "Doc_0/Pages/Page_0/Content.xml": `<ofd:Page xmlns:ofd="x"><ofd:Content><ofd:Layer>${deep}</ofd:Layer></ofd:Content></ofd:Page>` } }));
    await expect(loadOfdPage(doc, 0)).rejects.toBeInstanceOf(OfdLimitError);

    const original = OFD_LIMITS.pageNodes;
    OFD_LIMITS.pageNodes = 2;
    try {
      await expect(loadOfdPage(await open(buildOfd()), 0)).rejects.toBeInstanceOf(OfdLimitError);
    } finally {
      OFD_LIMITS.pageNodes = original;
    }
  });
});
