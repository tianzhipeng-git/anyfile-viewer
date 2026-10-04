// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { DOMParser } from "linkedom/worker";
import { Box3, ObjectLoader, Vector3 } from "three";
import { disposeObject } from "@anyfile/rendering-3d";
import { parseScene } from "./scene-parse";
import { checkSceneInput } from "./scene-budget";
vi.stubGlobal("DOMParser", DOMParser);
afterEach(() => vi.restoreAllMocks());
function fixture(name: string) { const data = readFileSync(new URL(`../fixtures/scenes/${name}`, import.meta.url)); return new Uint8Array(data).buffer; }
it.each(["room-ascii.fbx", "room-binary.fbx", "room.dae"])("parses %s with unit scale, axis, names, hierarchy and deferred textures", async name => {
  const data = await parseScene(fixture(name), name.endsWith("dae") ? "dae" : "fbx");
  expect(data.units).toBe("m"); expect(data.images.length).toBeGreaterThan(0);
  const root = new ObjectLoader().parse(data.json);
  try {
    const size = new Box3().setFromObject(root).getSize(new Vector3());
    expect(size.x).toBeCloseTo(6); expect(size.y).toBeCloseTo(3.2); expect(size.z).toBeCloseTo(4);
    expect(root.getObjectByName("Floor")).toBeDefined();
    expect(data.images[0].blob || data.images[0].uri).toBeTruthy();
  } finally { disposeObject(root); }
});
it("never fetches remote image references during parsing", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const source = new TextDecoder().decode(fixture("room.dae")).replace("surface.png", "https://example.invalid/private.png");
  const data = await parseScene(new TextEncoder().encode(source).buffer, "dae");
  expect(fetch).not.toHaveBeenCalled(); expect(data.images[0].uri).toBe("https://example.invalid/private.png");
});
it("rejects declarations and oversized arrays before loader allocation", () => {
  const source = new TextDecoder().decode(fixture("room.dae"));
  expect(() => checkSceneInput(new TextEncoder().encode(source.replace('count="24"', 'count="12000001"')).buffer, "dae")).toThrow(RangeError);
  expect(() => checkSceneInput(new TextEncoder().encode('<!DOCTYPE x>' + source).buffer, "dae")).toThrow("declarations");
  expect(() => checkSceneInput(new ArrayBuffer(10), "fbx")).toThrow();
});

it("checks actual compressed array expansion, not just declared counts", () => {
  const bytes = fixture("room-binary.fbx");
  const position = Buffer.from(bytes).indexOf("Vertices") + "Vertices".length;
  new DataView(bytes).setUint32(position + 1, 1, true);
  expect(() => checkSceneInput(bytes, "fbx")).toThrow("compressed array overflow");
});
