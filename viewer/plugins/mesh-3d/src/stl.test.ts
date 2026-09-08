import { describe, it, expect } from "vitest";
import { parseStl } from "./stl";
import { resourcePath } from "./resources";
const ascii = `solid test
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 1 0
endloop
endfacet
endsolid test`;
describe("STL validation", () => {
  it("reads ASCII facets and rebases without changing size", () => {
    const result = parseStl(new TextEncoder().encode(ascii).buffer);
    expect(result.triangles).toBe(1); expect(result.origin).toEqual([0.5, 0.5, 0]);
    expect([...result.positions]).toEqual([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0]);
  });
  it("recognizes binary STL even with a solid header", () => {
    const bytes = new ArrayBuffer(134); const view = new DataView(bytes);
    new Uint8Array(bytes).set(new TextEncoder().encode("solid binary")); view.setUint32(80, 1, true);
    view.setFloat32(108, 1, true); view.setFloat32(124, 1, true);
    expect(parseStl(bytes).triangles).toBe(1);
    view.setFloat32(96, NaN, true); expect(() => parseStl(bytes)).toThrow();
  });
  it("rejects truncated, malformed and extra facets", () => {
    for (const source of [ascii.replace("endfacet", ""), ascii.replace("vertex 0 1 0", "vertex NaN 1 0"), ascii + "\ngarbage"]) expect(() => parseStl(new TextEncoder().encode(source).buffer)).toThrow();
    expect(() => parseStl(new ArrayBuffer(133))).toThrow();
  });
});
describe("local resource paths", () => {
  it("normalizes local references", () => expect(resourcePath("textures/../a.png")).toBe("a.png"));
  it("rejects remote, encoded and traversal paths", () => {
    for (const path of ["https://example.org/a", "//a/b", "../secret", "%2e%2e/secret", "C:\\a", "data:text/html,x", "a?b"]) expect(() => resourcePath(path)).toThrow();
  });
});

describe("fixed PLY variants", () => {
  it("preserves indexed geometry and color in both byte orders", async () => {
    const {readFileSync}=await import("node:fs");const {loadPly}=await import("./ply");const {inspectObject,disposeObject}=await import("@anyfile/rendering-3d");
    for(const endian of ["little","big"]){const bytes=readFileSync(`examples/binary-${endian}.ply`);const doc=loadPly(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));expect(inspectObject(doc.root).size.toArray()).toEqual([1,1,1]);expect(inspectObject(doc.root).triangles).toBe(4);disposeObject(doc.root);}
  });
});
