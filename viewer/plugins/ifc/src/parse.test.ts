// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { IfcAPI } from "web-ifc";
import { Box3, Vector3 } from "three";
import { disposeObject, inspectObject } from "@anyfile/rendering-3d";
import { parseIfc } from "./parse";
import { ifcDocument } from "./adapter";
import { isIfcHeader } from "./probe";
const bytes = readFileSync(new URL("../fixtures/room.ifc", import.meta.url));
describe("IFC geometry", () => {
  it("parses real IFC with meter scaling, Y-up, placements, names and colors", async () => {
    const api = new IfcAPI(); await api.Init(); api.SetLogLevel(6);
    try {
      const data = parseIfc(api, bytes);
      expect(data.schema).toBe("IFC4"); expect(data.elements).toHaveLength(5);
      expect(data.elements.map(item => item.name)).toContain("North wall");
      expect(data.elements[0].parts[0].color).toEqual(expect.arrayContaining([0.65, 0.75, 0.85]));
      const doc = ifcDocument(data);
      try {
        expect(doc.units).toBe("m"); expect(doc.up).toBe("y");
        const size = new Box3().setFromObject(doc.root).getSize(new Vector3());
        expect(size.x).toBeCloseTo(6); expect(size.y).toBeCloseTo(3.2); expect(size.z).toBeCloseTo(4);
        expect(inspectObject(doc.root).triangles).toBeGreaterThan(0);
      } finally { disposeObject(doc.root); }
    } finally { api.Dispose(); }
  });
  it("keeps visible solids when the parser also returns empty mesh representations", async () => {
    const api = new IfcAPI(); await api.Init(); api.SetLogLevel(6);
    const getGeometry = api.GetGeometry.bind(api);
    vi.spyOn(api, "GetGeometry").mockImplementation((model, id) => {
      const geometry = getGeometry(model, id);
      if (id === 23) {
        geometry.GetVertexDataSize = () => 0;
        geometry.GetIndexDataSize = () => 0;
      }
      return geometry;
    });
    try {
      const data = parseIfc(api, bytes);
      expect(data.elements).toHaveLength(4);
      expect(data.elements.map(item => item.name)).toContain("North wall");
      expect(data.geometries.every(item => item.vertices.length > 0)).toBe(true);
    } finally { api.Dispose(); }
  });
  it.each(["IFC2X3", "IFC4X3_ADD2"])("reads the supported %s schema", async (schema) => {
    const api = new IfcAPI(); await api.Init(); api.SetLogLevel(6);
    try {
      let source = bytes.toString().replace("'IFC4'", `'${schema}'`);
      if (schema === "IFC2X3") source = source.replaceAll(",$,.NOTDEFINED.);", ",$,.ELEMENT.);");
      expect(parseIfc(api, new TextEncoder().encode(source)).elements).toHaveLength(5);
    } finally { api.Dispose(); }
  });
  it("rejects excessive decoded geometry before copying and closes the model", async () => {
    const api = new IfcAPI(); await api.Init(); api.SetLogLevel(6);
    const original = api.GetGeometry.bind(api);
    const close = vi.spyOn(api, "CloseModel");
    const copy = vi.spyOn(api, "GetVertexArray");
    vi.spyOn(api, "GetGeometry").mockImplementation((model, id) => {
      const geometry = original(model, id);
      geometry.GetVertexDataSize = () => 6_000_001 * 6;
      return geometry;
    });
    try {
      expect(() => parseIfc(api, bytes)).toThrow(RangeError);
      expect(copy).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
    } finally { api.Dispose(); }
  });
  it("rejects non-IFC STEP, unsupported schemas and empty models", async () => {
    expect(isIfcHeader("ISO-10303-21; FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));" )).toBe(false);
    expect(isIfcHeader("ISO-10303-21; FILE_SCHEMA(('IFC2X2'));" )).toBe(false);
    const api = new IfcAPI(); await api.Init(); api.SetLogLevel(6);
    try {
      expect(() => parseIfc(api, new TextEncoder().encode("bad"))).toThrow("header");
      const empty = new TextEncoder().encode("ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4')); ENDSEC; DATA; ENDSEC; END-ISO-10303-21;");
      expect(() => parseIfc(api, empty)).toThrow("No visible IFC geometry");
    } finally { api.Dispose(); }
  });
});
