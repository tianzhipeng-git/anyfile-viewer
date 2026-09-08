import { describe, expect, it } from "vitest";
import { Matrix4, Vector2, Vector3 } from "three";
import type { DwgDatabase, DwgEntity } from "@mlightcad/libredwg-web";
import { convertDrawing } from "./geometry";
import { insertTransform, ocs } from "./coordinates";
import { triangulateRings } from "./hatch";
import { plainCadText } from "./text";
import { polyline, spline } from "./curves";
import { SceneBuilder } from "./scene-builder";
function db(entities: unknown[], blocks: unknown[] = []) {
  return { header:{INSUNITS:4}, entities, tables:{LAYER:{entries:[{name:"0",colorIndex:7}]},BLOCK_RECORD:{entries:[{name:"*Model_Space",handle:"1",entities},...blocks]}} } as DwgDatabase;
}
const line = { type:"LINE",layer:"0",ownerBlockRecordSoftId:"1",startPoint:{x:0,y:0},endPoint:{x:10,y:0} };
function absolute(data: ReturnType<typeof convertDrawing>) { return Array.from(data.batches[0].positions,(v,i)=>v+data.origin[i%3]); }
describe("DWG geometry", () => {
  it("uses the model block instead of the converter's mixed-space entity list", () => {
    const database = db([line]); database.entities = [line,{...line,startPoint:{x:1000,y:1000}}] as unknown as DwgEntity[];
    expect(absolute(convertDrawing(database))).toEqual([0,0,0,10,0,0]);
  });
  it("subtracts block base points before scale and rotation", () => {
    const matrix = insertTransform({x:100,y:200},{x:10,y:0},{x:2,y:3},Math.PI/2,{x:0,y:0,z:1});
    const result = new Vector3(12,0,0).applyMatrix4(matrix);
    expect(result.x).toBeCloseTo(100); expect(result.y).toBeCloseTo(204);
  });
  it("applies a negative OCS normal using Autodesk's arbitrary axis algorithm", () => {
    expect(new Vector3(2,3,4).applyMatrix4(ocs({x:0,y:0,z:-1})).toArray()).toEqual([-2,3,-4]);
  });
  it("renders cached dimension blocks", () => {
    const data = convertDrawing(db([{type:"DIMENSION",name:"*D1"}],[{name:"*D1",entities:[line]}]));
    expect(absolute(data)).toEqual([0,0,0,10,0,0]); expect(data.warnings.DIMENSION).toBeUndefined();
  });
  it("reads nested attribute text and omits invisible attributes", () => {
    const text = {text:"Visible",startPoint:{x:3,y:4},textHeight:2};
    const data = convertDrawing(db([line,{type:"ATTRIB",flags:0,text},{type:"ATTRIB",flags:1,text}]));
    expect(data.texts).toHaveLength(1);expect(data.texts[0].text).toBe("Visible");
  });
  it("rejects recursive inserts rather than hanging", () => {
    const insert = {type:"INSERT",name:"loop",insertionPoint:{x:0,y:0}};
    expect(()=>convertDrawing(db([insert],[{name:"loop",basePoint:{x:0,y:0},entities:[insert]}]))).toThrow(RangeError);
  });
  it("keeps solid hatch holes unfilled", () => {
    const ring = (min:number,max:number) => [[min,min],[max,min],[max,max],[min,max]].map(([x,y])=>new Vector2(x,y));
    const triangles = triangulateRings([ring(0,10),ring(3,7)]);
    let area = 0;
    for(let i=0;i<triangles.length;i+=3) area += triangles[i+1].clone().sub(triangles[i]).cross(triangles[i+2].clone().sub(triangles[i])).length()/2;
    expect(area).toBeCloseTo(84);
  });
  it("samples a bulge as a semicircle, not its chord", () => {
    const points = polyline([{x:0,y:0,bulge:1},{x:10,y:0}],false);
    expect(points.length).toBeGreaterThan(20); expect(Math.max(...points.map(p=>Math.abs(p.y)))).toBeCloseTo(5);
  });
  it("evaluates rational B-splines", () => {
    const result = spline({degree:2,knots:[0,0,0,1,1,1],controlPoints:[{x:1,y:0,z:0},{x:1,y:1,z:0},{x:0,y:1,z:0}],weights:[1,Math.SQRT1_2,1]} as Parameters<typeof spline>[0]);
    expect(result).toBeDefined(); const middle = result![Math.floor(result!.length/2)]; expect(middle.length()).toBeCloseTo(1);
  });
  it("decodes CAD text as plain text without introducing DOM markup", () => {
    expect(plainCadText("{\\H0.7x;A\\P\\U+4E2D %%d \\S1#2;}<svg>" )).toBe("A\n中 ° 1/2<svg>");
  });
  it("rebases large coordinates before float32 conversion", () => {
    const builder = new SceneBuilder();builder.add([new Vector3(1e10,0,0),new Vector3(1e10+0.25,0,0)],{layer:"0",color:7},new Matrix4());
    expect(Array.from(builder.finish({},4).batches[0].positions)).toEqual([-0.125,0,0,0.125,0,0]);
  });
});
