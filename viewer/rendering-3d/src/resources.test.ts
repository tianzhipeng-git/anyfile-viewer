import { describe, it, expect, vi } from "vitest";
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from "three";
import { disposeObject, inspectObject } from "./resources";
describe("3D document ownership and bounds", () => {
  it("fits a point, tiny geometry and shared resources", () => {
    const root = new Group(); const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
    const material = new MeshBasicMaterial(); root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    expect(inspectObject(root).vertices).toBe(3);
    expect(inspectObject(root).size.x).toBeCloseTo(0.01);
    const geometryDispose = vi.spyOn(geometry, "dispose"), materialDispose = vi.spyOn(material, "dispose");
    disposeObject(root); disposeObject(root); expect(geometryDispose).toHaveBeenCalledTimes(1); expect(materialDispose).toHaveBeenCalledTimes(1);
  });
  it("rejects bad indices and nonfinite positions", () => {
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3)); geometry.setIndex([2]);
    expect(() => inspectObject(new Mesh(geometry))).toThrow("Invalid index");
    geometry.setIndex(null); geometry.setAttribute("position", new Float32BufferAttribute([NaN, 0, 0], 3));
    expect(() => inspectObject(new Mesh(geometry))).toThrow("Non-finite");
  });
});
