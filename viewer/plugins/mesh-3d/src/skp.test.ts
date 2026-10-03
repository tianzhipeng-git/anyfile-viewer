import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { buildInstancedScene } from "openskp";
import { zipSync } from "fflate";
import { parseSkpForViewer, validateSkpInput, validateSkpScene } from "./skp";
import { probeMesh3d } from "./probe";
import { loadGltf } from "./gltf";
import { disposeObject, inspectObject } from "@anyfile/rendering-3d";

function fixture(name: string) {
  const bytes = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../examples", name));
  return new Uint8Array(bytes).buffer;
}

it.each(["chair-and-table.skp", "chapel-v17.skp", "model-v25.skp"])("parses %s through the actual SKP decoder into a placed scene", async name => {
  const buffer = fixture(name);
  const file = new File([buffer], "model.SKP");
  expect(await probeMesh3d({ file, signal: new AbortController().signal })).toBe(3);
  const glb = parseSkpForViewer(buffer);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, new DataView(glb).getUint32(12, true))));
  expect(json.asset.version).toBe("2.0");
  expect(json.meshes.length).toBeGreaterThan(0);
  expect(json.nodes.length).toBeGreaterThan(0);
  expect(json.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
  expect((json.images ?? []).every((image: { uri?: string }) => !image.uri)).toBe(true);
  if (name === "chapel-v17.skp") expect(json.images.length).toBe(3);
});

it("preserves component placement, units and reusable meshes through the rendering adapter", async () => {
  const glb = parseSkpForViewer(fixture("chair-and-table.skp"));
  const doc = await loadGltf(glb, { file: new File([], "model.skp"), container: document.createElement("div"), signal: new AbortController().signal, locale: "en", reportProgress() {} });
  try {
    expect(doc.units).toBe("m");
    const stats = inspectObject(doc.root);
    expect(stats.triangles).toBeGreaterThan(0);
    expect(stats.size.x).toBeCloseTo(1.2446, 4);
    expect(stats.size.y).toBeCloseTo(0.8636, 4);
    expect(stats.size.z).toBeCloseTo(0.508, 4);
  } finally { disposeObject(doc.root); }
});

it("rejects renamed and truncated files", async () => {
  const bad = new File(["not a SketchUp model"], "bad.skp");
  expect(await probeMesh3d({ file: bad, signal: new AbortController().signal })).toBe(0);
  expect(() => parseSkpForViewer(fixture("model-v25.skp").slice(0, 100))).toThrow();
  expect(() => parseSkpForViewer(new ArrayBuffer(0))).toThrow();
});

it("rejects declared ZIP expansion before decoding", () => {
  const zip = zipSync({ "model.dat": new Uint8Array([1]) });
  const view = new DataView(zip.buffer);
  for (let i = 0; i < zip.length - 4; i++) {
    if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 65 * 1024 * 1024, true);
  }
  const bytes = new Uint8Array(69 + zip.length);
  bytes.set(new Uint8Array(fixture("model-v25.skp"), 0, 69)); bytes.set(zip, 69);
  expect(() => validateSkpInput(bytes)).toThrow(RangeError);
});

it("rejects excessive placed instances before generating render buffers", () => {
  const scene = buildInstancedScene(fixture("chair-and-table.skp"));
  scene.sceneHierarchy.children = Array(4097).fill({ ...scene.sceneHierarchy, children: [] });
  expect(() => validateSkpScene(scene)).toThrow(RangeError);
});

it("honors probe cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(probeMesh3d({ file: new File([], "model.skp"), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});
