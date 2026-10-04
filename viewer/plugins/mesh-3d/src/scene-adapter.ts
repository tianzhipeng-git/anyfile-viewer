import { ObjectLoader, Texture, type Material, type Object3D } from "three";
import { disposeObject, type Rendering3dDocument } from "@anyfile/rendering-3d";
import { ViewerError, selectMessages, type OpenViewerContext } from "@anyfile/viewer-protocol";
import { localResources } from "./resources";
import { imagePixels, checkTexturePixelBudget } from "./image-budget";
import { readScene } from "./scene-client";
import type { SceneData } from "./scene-types";
export async function loadScene(bytes: ArrayBuffer, format: "fbx" | "dae", context: OpenViewerContext) {
  const data = await readScene(bytes, format, context.signal);
  context.signal.throwIfAborted();
  return sceneDocument(data, context);
}
export async function sceneDocument(data: SceneData, context: OpenViewerContext): Promise<Rendering3dDocument> {
  const resources = localResources(context);
  let root: Object3D | undefined;
  try {
    root = new ObjectLoader(resources.manager).parse(data.json);
    const textures = new Map<string, { texture: Texture; uses: { material: Material; key: string }[] }>();
    root.traverse(object => {
      const materials = (object as Object3D & { material?: Material | Material[] }).material;
      for (const material of [materials].flat()) if (material) for (const [key, value] of Object.entries(material)) if (value instanceof Texture) {
        if (!textures.has(value.uuid)) textures.set(value.uuid, { texture: value, uses: [] });
        textures.get(value.uuid)!.uses.push({ material, key });
      }
    });
    let pixels = 0, missing = false;
    for (const [id, { texture, uses }] of textures) {
      try {
        context.signal.throwIfAborted();
        const image = data.images.find(image => image.id === id);
        if (!image) throw new Error("Missing image");
        const blob = image.blob ?? await (await fetch(await resources.prepare(image.uri!, true), { signal: context.signal })).blob();
        pixels += await imagePixels(blob); checkTexturePixelBudget(pixels, context.locale);
        const bitmap = await createImageBitmap(blob, { imageOrientation: texture.flipY ? "flipY" : "none", premultiplyAlpha: "none" });
        if (context.signal.aborted) { bitmap.close(); context.signal.throwIfAborted(); }
        texture.image = bitmap; texture.needsUpdate = true;
      } catch (error) {
        if (context.signal.aborted || error instanceof RangeError || (error instanceof ViewerError && error.code === "resource-limit")) throw error;
        missing = true;
        for (const { material, key } of uses) { (material as unknown as Record<string, unknown>)[key] = null; material.needsUpdate = true; }
        texture.dispose();
      }
    }
    context.signal.throwIfAborted();
    return { root, units: data.units, up: "y", animations: root.animations,
      description: missing ? selectMessages(context.locale, { en: "Some textures are missing or unsupported. Open the model folder for local PNG/JPEG textures.", "zh-CN": "部分纹理缺失或不受支持；可打开模型文件夹以读取本地 PNG/JPEG 纹理。" }) : undefined };
  } catch (error) { if (root) disposeObject(root); throw error; }
  finally { resources.dispose(); }
}
