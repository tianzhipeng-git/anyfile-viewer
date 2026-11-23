import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadOfdDocument } from "./document";
import { loadOfdPage } from "./model";
import { OfdPackage } from "./package";
import { paintPage } from "./painter";
import { buildOfd } from "./test-fixtures";

class FakePath {
  constructor(readonly d?: string) {}
  addPath() {}
}

/** Recording 2D context: unknown members become recorded calls; style assignments are kept. */
function recordingContext() {
  const calls: { name: string; args: unknown[]; fillStyle?: unknown; font?: unknown }[] = [];
  const state: Record<string, unknown> = { fillStyle: "#000", globalAlpha: 1, lineWidth: 1 };
  const special: Record<string, unknown> = {
    canvas: { width: 100, height: 50 },
    getTransform: () => new DOMMatrix(),
    getLineDash: () => [],
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ name: "createLinearGradient", args });
      return { addColorStop: (...stop: unknown[]) => calls.push({ name: "addColorStop", args: stop }) };
    },
  };
  const ctx = new Proxy(state, {
    get: (target, key: string) =>
      key in special ? special[key] : key in target ? target[key] : (...args: unknown[]) => calls.push({ name: key, args, fillStyle: target.fillStyle, font: target.font }),
    set: (target, key: string, value) => ((target[key] = value), true),
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

beforeEach(() => vi.stubGlobal("Path2D", FakePath));
afterEach(() => vi.unstubAllGlobals());

describe("OFD painter", () => {
  it("paints shadings, clips, strokes, composites and fallback-font text", async () => {
    const pkg = await OfdPackage.open(buildOfd(), new AbortController().signal);
    const page = await loadOfdPage(await loadOfdDocument(pkg), 0);
    const { ctx, calls } = recordingContext();
    paintPage(ctx, page, { fonts: new Map(), images: new Map(), seals: new Map() });
    await pkg.close();

    const names = calls.map((call) => call.name);
    expect(names.filter((name) => name === "createLinearGradient")).toHaveLength(1);
    expect(names.filter((name) => name === "addColorStop")).toHaveLength(2);
    expect(names).toContain("clip");
    expect(names.filter((name) => name === "stroke")).toHaveLength(2); // clipped line + composite unit
    // No embedded font: each cluster is drawn with the declared family, bold from Weight="700".
    const texts = calls.filter((call) => call.name === "fillText");
    expect(texts.map((call) => call.args[0])).toEqual(["a", "<f", "i"]);
    expect(String(texts[0]!.font)).toMatch(/^bold 100px "宋体", "SimSun"/);
  });
});
