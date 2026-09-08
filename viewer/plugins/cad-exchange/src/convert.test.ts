import { expect, it } from "vitest";
import { convertCad } from "./convert";
import { cadExchangeDocument } from "./adapter";
import { disposeObject, inspectObject } from "@anyfile/rendering-3d";
import type { KernelResult } from "./types";
function fixture(): KernelResult {
  return {success:true,root:{name:"assembly",meshes:[0],children:[]},meshes:[{name:"face",attributes:{position:{array:[1e9,0,0,1e9+1,0,0,1e9+1,1,0,1e9,1,0]}},index:{array:[0,1,2,0,2,3]},brep_faces:[{first:0,last:1,color:[1,0,0]}]}]};
}
it("rebases before float conversion and extracts face boundaries without triangle diagonals", () => {
  const result=convertCad(fixture(),33554432);
  expect(result.origin).toEqual([1e9+.5,.5,0]);expect(result.meshes[0].edges.length).toBe(24);expect(Array.from(result.meshes[0].colors.slice(0,3))).toEqual([1,0,0]);
  const doc=cadExchangeDocument(result,false);expect(inspectObject(doc.root).size.toArray()).toEqual([1,1,0]);expect(doc.units).toBe("mm");disposeObject(doc.root);
});
it("rejects invalid indices, vertices and kernel budget failures", () => {
  const result=fixture();result.meshes[0].index.array[0]=0.5;expect(()=>convertCad(result)).toThrow();
  result.meshes[0].index.array[0]=0;result.meshes[0].attributes.position.array[0]=NaN;expect(()=>convertCad(result)).toThrow();
  expect(()=>convertCad({...fixture(),success:false,error:"resource-limit"})).toThrow(RangeError);
});
