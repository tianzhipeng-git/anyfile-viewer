import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTrueType } from "@anyfile/viewer-rendering/fixed-layout";

import { loadXpsDocument } from "./document";
import { deobfuscateFont } from "./font";
import { XpsPackage } from "./package";
import { paintPage } from "./painter";
import type { XpsImage } from "./resources";
import { buildXps } from "./test-fixtures";
import { loadXpsPage } from "./view";

const signal = new AbortController().signal;

class FakePath {
  static created: FakePath[] = [];
  readonly added: unknown[] = [];
  constructor(readonly d?: string) {
    FakePath.created.push(this);
  }
  addPath(path: unknown) {
    this.added.push(path);
  }
}

/** Minimal recording 2D context that tracks the transform stack like a real canvas. */
function recordingContext(width: number, height: number) {
  const calls: { name: string; args: unknown[]; fillStyle?: unknown }[] = [];
  let matrix = new DOMMatrix();
  const stack: DOMMatrix[] = [];
  const state: Record<string, unknown> = { fillStyle: "#000", globalAlpha: 1 };
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args, fillStyle: state.fillStyle });
  };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      switch (key) {
        case "canvas": return { width, height };
        case "save": return () => stack.push(matrix);
        case "restore": return () => { matrix = stack.pop() ?? matrix; };
        case "transform": return (a: number, b: number, c: number, d: number, e: number, f: number) => { matrix = matrix.multiply(new DOMMatrix([a, b, c, d, e, f])); };
        case "setTransform": return (...args: number[]) => { matrix = new DOMMatrix(args); };
        case "translate": return (x: number, y: number) => { matrix = matrix.translate(x, y); };
        case "scale": return (x: number, y: number) => { matrix = matrix.scale(x, y); };
        case "getTransform": return () => matrix;
        case "getLineDash": return () => [];
        case "measureText": return (text: string) => ({ width: text.length * 5 });
        case "createLinearGradient":
        case "createRadialGradient":
          return (...args: unknown[]) => { calls.push({ name: key, args }); return { addColorStop: record("addColorStop") }; };
        default:
          return key in target ? target[key] : record(key);
      }
    },
    set(target, key: string, value) {
      target[key] = value;
      if (key === "lineWidth" || key === "lineDashOffset") calls.push({ name: `set:${key}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

beforeEach(() => {
  FakePath.created = [];
  vi.stubGlobal("Path2D", FakePath);
});

afterEach(() => vi.unstubAllGlobals());

describe("XPS painter", () => {
  it("draws Microsoft XPS glyph runs from embedded TrueType outlines", async () => {
    const pkg = await XpsPackage.open(new File([readFileSync(join(process.cwd(), "examples", "testPPT.xps"))], "a.xps"), signal);
    const doc = await loadXpsDocument(pkg);
    const page = await loadXpsPage(pkg, doc.pages[1]!.part);
    const [key] = [...page.fonts];
    const part = key!.split("#")[0]!;
    const font = parseTrueType(deobfuscateFont(await pkg.bytes(part, 1 << 20), part));
    const { ctx, calls } = recordingContext(960, 720);

    paintPage(ctx, page, { fonts: new Map([[key!, font]]), images: new Map() });

    const fills = calls.filter((call) => call.name === "fill");
    // White slide background path + seven glyph runs, all solid fills.
    expect(fills).toHaveLength(8);
    expect(fills.at(-1)?.fillStyle).toBe("rgba(0,0,0,1)");
    const runs = FakePath.created.filter((path) => path.added.length > 0);
    const visibleGlyphs = "This is a test file data with the same content as every other file being tested for tika content parsing. This has been developed by Rajiv Kumar Nistala."
      .replace(/ /g, "").length;
    expect(runs.reduce((sum, path) => sum + path.added.length, 0)).toBe(visibleGlyphs);
    expect(calls.some((call) => call.name === "fillText")).toBe(false);
    await pkg.close();
  });

  it("maps image brush viewboxes and falls back to a system font for missing fonts", async () => {
    const pkg = await XpsPackage.open(new File([readFileSync(join(process.cwd(), "examples", "ghostscript-shapes.xps"))], "b.xps"), signal);
    const doc = await loadXpsDocument(pkg);
    const page = await loadXpsPage(pkg, doc.pages[0]!.part);
    const image: XpsImage = { source: {} as CanvasImageSource, pixelWidth: 8, pixelHeight: 8, width: 8, height: 8, close() {} };
    const { ctx, calls } = recordingContext(793, 1122);
    paintPage(ctx, page, { fonts: new Map(), images: new Map([[[...page.images][0]!, image]]) });
    const draw = calls.find((call) => call.name === "drawImage");
    expect(draw?.args.slice(1)).toEqual([0, 0, 8, 8, 0, 0, 8, 8]);
    expect(calls.filter((call) => call.name === "stroke")).toHaveLength(1);
    await pkg.close();

    const synthetic = await XpsPackage.open(buildXps(), signal);
    const first = await loadXpsPage(synthetic, (await loadXpsDocument(synthetic)).pages[0]!.part);
    const recorded = recordingContext(200, 100);
    paintPage(recorded.ctx, first, { fonts: new Map(), images: new Map() });
    expect(recorded.calls.find((call) => call.name === "createLinearGradient")?.args).toEqual([0, 0, 10, 0]);
    expect(recorded.calls.find((call) => call.name === "setLineDash")?.args).toEqual([[2, 2]]);
    expect(recorded.calls.filter((call) => call.name === "fillText").map((call) => call.args[0]).join("")).toBe("Hello XPS");
    await synthetic.close();
  });
});
