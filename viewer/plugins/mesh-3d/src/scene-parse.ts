import { Mesh, Group, LoadingManager, Texture, TextureLoader, type Object3D } from "three";
import { inspectObject, disposeObject } from "@anyfile/rendering-3d";
import { checkSceneInput } from "./scene-budget";
import type { SceneData, SceneImage } from "./scene-types";

// A loader dependency injected through Three's loader interfaces. Parsing never
// loads an image or accesses the network; the host resolves these records later.
class DeferredTextures extends TextureLoader {
  readonly images: SceneImage[] = [];
  override load(uri: string) {
    if (this.images.length >= 256) throw new RangeError("Scene texture budget");
    const texture = new Texture<HTMLImageElement>();
    this.images.push({ id: texture.uuid, uri });
    return texture;
  }
}
export async function parseScene(bytes: ArrayBuffer, format: "fbx" | "dae"): Promise<SceneData> {
  checkSceneInput(bytes, format);
  const manager = new LoadingManager();
  manager.setURLModifier(() => { throw new Error("Scene parser network access blocked"); });
  const textures = new DeferredTextures(manager);
  manager.addHandler(/.*/, textures);
  let root: Object3D | undefined, units: string | undefined;
  try {
    if (format === "fbx") {
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      const scene = new FBXLoader(manager).parse(bytes, ""); root = scene;
      const scale = scene.userData.unitScaleFactor;
      // FBX UnitScaleFactor describes centimeters per source unit. A wrapper
      // preserves the imported root's scale and animation tracks.
      if (scale !== undefined) {
        if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid FBX unit");
        const wrapper = new Group(); wrapper.add(scene); wrapper.scale.setScalar(scale / 100); wrapper.animations = scene.animations; root = wrapper; units = "m";
      }
    } else {
      const [{ ColladaParser }, { ColladaComposer }] = await Promise.all([
        import("three/addons/loaders/collada/ColladaParser.js"), import("three/addons/loaders/collada/ColladaComposer.js"),
      ]);
      const parsed = new ColladaParser().parse(new TextDecoder().decode(bytes));
      if (!parsed) throw new Error("Invalid COLLADA");
      if (!Number.isFinite(parsed.asset.unit) || parsed.asset.unit <= 0) throw new Error("Invalid COLLADA unit");
      const composed = new ColladaComposer(parsed.library, parsed.collada, textures, textures).compose();
      root = composed.scene; root.animations = composed.animations;
      if (parsed.asset.upAxis === "Z_UP") root.rotation.x = -Math.PI / 2;
      else if (parsed.asset.upAxis === "X_UP") root.rotation.z = Math.PI / 2;
      else if (parsed.asset.upAxis !== "Y_UP") throw new Error("Unknown COLLADA up axis");
      root.scale.multiplyScalar(parsed.asset.unit); units = "m";
    }
    let nodes = 0;
    root.traverse(object => {
      if (++nodes > 16384) throw new RangeError("Scene hierarchy budget");
      if ((object as Object3D & { isLight?: boolean }).isLight) object.visible = false;
      if (object instanceof Mesh && !object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals();
    });
    inspectObject(root);
    const json = root.toJSON() as SceneData["json"] & { images?: { url: unknown }[] };
    // Preserve texture metadata without allowing ObjectLoader to issue requests.
    for (const image of json.images ?? []) image.url = {};
    for (const image of textures.images) if (image.uri?.startsWith("blob:")) {
      const response = await fetch(image.uri); image.blob = await response.blob();
      URL.revokeObjectURL(image.uri); delete image.uri;
    }
    return { json, images: textures.images, units };
  } finally {
    for (const image of textures.images) if (image.uri?.startsWith("blob:")) URL.revokeObjectURL(image.uri);
    if (root) disposeObject(root);
  }
}
