import { describe, expect, it } from "vitest";
import { inspectObject } from "@anyfile/rendering-3d";
import { parse3mf } from "./three-mf";
import { loadAmf } from "./amf";
const geometry = '<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh>';
describe("3MF build semantics", () => {
  it("applies components and build transforms without changing units", () => {
    const doc = parse3mf(`<model unit="inch"><resources><object id="1">${geometry}</object><object id="2"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 3 0 0"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 4 0"/></build></model>`);
    expect(doc.units).toBe("inch"); const stats = inspectObject(doc.root); expect(stats.bounds.min.toArray()).toEqual([3,4,0]);
  });
  it("rejects cycles, missing objects and external entities", () => {
    for (const source of ['<!DOCTYPE model [<!ENTITY a SYSTEM "file:///secret">]><model/>','<model><resources/><build><item objectid="1"/></build></model>','<model><resources><object id="1"><components><component objectid="1"/></components></object></resources><build><item objectid="1"/></build></model>']) expect(()=>parse3mf(source)).toThrow();
  });
  it("rejects invalid vertex references", () => expect(()=>parse3mf(`<model><resources><object id="1">${geometry.replace('v3="2"','v3="12"')}</object></resources><build><item objectid="1"/></build></model>`)).toThrow());
});
it("parses AMF volumes with units", () => {
  const doc = loadAmf('<amf unit="millimeter"><object id="1"><mesh><vertices><vertex><coordinates><x>0</x><y>0</y><z>0</z></coordinates></vertex><vertex><coordinates><x>1</x><y>0</y><z>0</z></coordinates></vertex><vertex><coordinates><x>0</x><y>1</y><z>0</z></coordinates></vertex></vertices><volume><triangle><v1>0</v1><v2>1</v2><v3>2</v3></triangle></volume></mesh></object></amf>');
  expect(doc.units).toBe('millimeter'); expect(inspectObject(doc.root).vertices).toBe(3);
});
