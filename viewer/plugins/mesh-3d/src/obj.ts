import { checkObjBudget } from "./obj-budget";
import { disposeObject } from "@anyfile/rendering-3d";
import type { Group } from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { selectMessages, type OpenViewerContext } from "@anyfile/viewer-protocol";
import { localResources, resourcePath } from "./resources";
export async function loadObj(source: string, context: OpenViewerContext) {
  source = checkObjBudget(source);
  const resources = localResources(context);
  let missing = false;
  let root: Group | undefined;
  const loader = new OBJLoader(resources.manager);
  try {
    const libraries = [...source.matchAll(/^\s*mtllib\s+(.+)$/gm)].map(match => match[1].trim());
    if (libraries.length > 32) throw new RangeError();
    let materials = "";
    for (const uri of libraries) {
      const path = resourcePath(uri); const file = await context.workspace?.open(path, { signal: context.signal });
      if (!file) { missing = true; continue; }
      if (file.size > 1024 * 1024) throw new RangeError();
      const text = await file.text();
      const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
      const lines: string[] = [];
      for (const line of text.split(/\r?\n/)) {
        // Texture options require a real MTL grammar; unsupported maps are
        // omitted with a visible limitation, never handed to a network loader.
        if (/^\s*(?:map_\S+|bump|disp|decal|norm)\s/i.test(line)) {
          const match = /^\s*(map_Kd)\s+([^\s-][^\r\n]*)$/i.exec(line);
          if (!match) { missing = true; continue; }
          try { const url = await resources.prepare(directory + match[2].trim(), true); lines.push(`${match[1]} ${url}`); }
          catch (error) { if (context.signal.aborted) throw error; missing = true; }
        } else lines.push(line);
      }
      materials += lines.join("\n") + "\n";
    }
    if (materials) loader.setMaterials(new MTLLoader(resources.manager).parse(materials, ""));
    root = loader.parse(source);
    // Image loading is asynchronous; wait before revoking local URLs.
    await resources.wait();
    return { root, description: missing ? selectMessages(context.locale, { en: "Some materials or textures are unavailable", "zh-CN": "部分材质或纹理不可用" }) : undefined };
  } catch (error) { if (root) disposeObject(root); throw error; } finally { resources.dispose(); }
}
