declare module "linkedom/worker" {
  export { DOMParser } from "linkedom";
}
declare module "three/addons/loaders/collada/ColladaParser.js" {
  export class ColladaParser {
    parse(text: string): { library: object; collada: Element; asset: { unit: number; upAxis: string } } | null;
  }
}
declare module "three/addons/loaders/collada/ColladaComposer.js" {
  import type { Group, TextureLoader, AnimationClip } from "three";
  export class ColladaComposer {
    constructor(library: object, collada: Element, textures: TextureLoader, tga: TextureLoader);
    compose(): { scene: Group; animations: AnimationClip[] };
  }
}
