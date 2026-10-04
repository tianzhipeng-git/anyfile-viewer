import type { Object3DJSON } from "three";
export interface SceneImage { id: string; uri?: string; blob?: Blob }
export interface SceneData { json: Object3DJSON; images: SceneImage[]; units?: string }
