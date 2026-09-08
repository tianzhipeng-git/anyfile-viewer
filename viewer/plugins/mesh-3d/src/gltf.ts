import { validateNodeGraph } from "./gltf-structure";
import { imagePixels } from "./image-budget";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ViewerError, selectMessages, type OpenViewerContext } from "@anyfile/viewer-protocol";
import { disposeObject } from "@anyfile/rendering-3d";
import { localResources } from "./resources";

export async function loadGltf(bytes: ArrayBuffer, context: OpenViewerContext) {
  const view = new DataView(bytes); let source: string;
  const binary = bytes.byteLength >= 12 && view.getUint32(0, true) === 0x46546c67;
  if (binary) {
    if (view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength || bytes.byteLength < 20 || view.getUint32(16, true) !== 0x4e4f534a) throw new Error("Invalid GLB");
    const length = view.getUint32(12, true); if (20 + length > bytes.byteLength || length > 16 * 1024 * 1024) throw new RangeError();
    source = new TextDecoder().decode(bytes.slice(20, 20 + length));
  } else source = new TextDecoder().decode(bytes);
  const json = JSON.parse(source);
  if (json.asset?.version !== "2.0") throw new Error("Unsupported glTF version");
  if ((json.nodes?.length ?? 0) > 4096 || (json.accessors?.length ?? 0) > 16384) throw new RangeError();
  validateNodeGraph(json.nodes ?? [], (json.scenes ?? []).flatMap((scene: { nodes?: number[] }) => scene.nodes ?? []));
  let elements = 0;
  for (const accessor of json.accessors ?? []) { if (!Number.isSafeInteger(accessor.count) || accessor.count < 0) throw new Error("Invalid accessor"); elements += accessor.count; }
  if (elements > 20_000_000) throw new RangeError();
  if (json.extensionsRequired?.some((name: string) => ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"].includes(name))) throw new Error("Compressed glTF requires an unavailable decoder");
  const resources = localResources(context);
  try {
    let pixels = 0; let missingImages = 0;
    for (const [imageIndex, entry] of (json.images ?? []).entries()) {
      try {
      if (entry.uri) await resources.prepare(entry.uri, true);
      else {
        const bufferView = json.bufferViews?.[entry.bufferView];
        if (!binary || !bufferView || bufferView.buffer !== 0) throw new Error("Unsupported embedded image storage");
        const start = 20 + view.getUint32(12, true);
        if (start + 8 > bytes.byteLength || view.getUint32(start + 4, true) !== 0x004e4942) throw new Error("Missing GLB binary chunk");
        const offset = bufferView.byteOffset ?? 0, length = bufferView.byteLength;
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > view.getUint32(start, true)) throw new Error("Invalid image range");
        pixels += await imagePixels(new Blob([bytes.slice(start + 8 + offset, start + 8 + offset + length)]));
        if (pixels > 32_000_000) throw new RangeError("Texture budget");
      }
      if (pixels + resources.imagePixels > 32_000_000) throw new RangeError("Total texture budget");
      } catch (error) {
        if (context.signal.aborted || error instanceof RangeError || (error instanceof ViewerError && error.code === "resource-limit")) throw error;
        // Optional textures must not prevent inspection of otherwise valid geometry.
        missingImages++;
        const textures = new Set<number>((json.textures ?? []).flatMap((texture: { source?: number }, index: number) => texture.source === imageIndex ? [index] : []));
        const omit = (object: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(object)) if (value && typeof value === "object") {
            if (key.endsWith("Texture") && textures.has((value as { index: number }).index)) delete object[key];
            else omit(value as Record<string, unknown>);
          }
        };
        for (const material of json.materials ?? []) omit(material);
        json.images[imageIndex] = {};
      }
    }
    for (const entry of json.buffers ?? []) if (entry.uri) await resources.prepare(entry.uri);
    const loader = new GLTFLoader(resources.manager);
    // GLB embedded images create their own blob URLs inside the loader. They
    // never reach a remote origin; permit only those created by this parse.
    // External resources are replaced up front, so all original URIs are gone.
    for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])]) if (entry.uri) entry.uri = await resources.prepare(entry.uri);
    // Keep binary chunks intact and replace just the padded JSON chunk.
    let input: string | ArrayBuffer = JSON.stringify(json);
    if (binary) {
      const jsonBytes = new TextEncoder().encode(input); const padded = Math.ceil(jsonBytes.length / 4) * 4;
      const previousEnd = 20 + view.getUint32(12, true); const output = new Uint8Array(20 + padded + bytes.byteLength - previousEnd);
      output.set(new Uint8Array(bytes, 0, 12)); const header = new DataView(output.buffer); header.setUint32(8, output.length, true); header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true);
      output.fill(32, 20, 20 + padded); output.set(jsonBytes, 20); output.set(new Uint8Array(bytes, previousEnd), 20 + padded); input = output.buffer;
    }
    // No file-supplied URI remains. Embedded images use loader-owned blobs.
    resources.manager.setURLModifier(uri => { if (!uri.startsWith("blob:")) throw new Error("Network blocked"); return uri; });
    const result = await loader.parseAsync(input, "");
    if (context.signal.aborted) { disposeObject(result.scene); throw new DOMException("Aborted", "AbortError"); }
    return { root: result.scene, units: "m", animations: result.animations, description: missingImages ? selectMessages(context.locale, { en: "Some textures are missing or unsupported; geometry remains visible.", "zh-CN": "部分纹理缺失或不受支持；几何仍可查看。" }) : undefined };
  } finally { resources.dispose(); }
}
