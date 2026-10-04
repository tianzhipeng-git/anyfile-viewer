import { afterEach, expect, it, vi } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three";
import { disposeObject } from "@anyfile/rendering-3d";
import { sceneDocument } from "./scene-adapter";
import type { SceneData } from "./scene-types";
function scene(uri: string): SceneData {
  const root = new Group(), texture = new Texture();
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture })));
  const json = root.toJSON() as SceneData["json"] & { images: { url: unknown }[] };
  for (const image of json.images) image.url = {};
  disposeObject(root); return { json, images: [{ id: texture.uuid, uri }], units: "m" };
}
function context() { return { file: new File([], "scene.dae"), signal: new AbortController().signal, container: document.createElement("div"), locale: "en" as const, reportProgress() {} }; }
afterEach(() => vi.restoreAllMocks());
it.each(["https://example.invalid/texture.png", "../secret.png", "missing.png"])("retains geometry without fetching unavailable image %s", async uri => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const doc = await sceneDocument(scene(uri), context());
  expect(doc.description).toContain("textures"); expect(fetch).not.toHaveBeenCalled();
  expect(((doc.root.children[0] as Mesh).material as MeshStandardMaterial).map).toBeNull();
  disposeObject(doc.root);
});
it("cancellation cannot become a missing-texture warning", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(sceneDocument(scene("white.png"), { ...context(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});
it("decodes embedded textures and releases their bitmaps with the scene", async () => {
  const bytes = new Uint8Array(24); const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a); view.setUint32(12, 0x49484452); view.setUint32(16, 1); view.setUint32(20, 1);
  class Bitmap { close = vi.fn(); }
  const bitmap = new Bitmap(); vi.stubGlobal("ImageBitmap", Bitmap);
  const decode = vi.fn(async () => bitmap); vi.stubGlobal("createImageBitmap", decode);
  try {
    const data = scene("unused"); data.images[0] = { id: data.images[0].id, blob: new Blob([bytes]) };
    const doc = await sceneDocument(data, context());
    expect(doc.description).toBeUndefined(); expect(decode).toHaveBeenCalledOnce();
    expect(((doc.root.children[0] as Mesh).material as MeshStandardMaterial).map!.image).toBe(bitmap);
    disposeObject(doc.root); expect(bitmap.close).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
