import { expect, it } from "vitest";
import { validateNodeGraph } from "./gltf-structure";
it("rejects cyclic and out-of-range nodes before asynchronous loader resolution", () => {
  expect(() => validateNodeGraph([{children:[1]}, {children:[0]}], [0])).toThrow("Cyclic");
  expect(() => validateNodeGraph([{children:[1]}], [0])).toThrow("index");
  expect(() => validateNodeGraph([{children:[0]}], [])).toThrow("Cyclic");
});
it("permits bounded acyclic hierarchies and rejects excessive depth", () => {
  expect(() => validateNodeGraph([{children:[1]}, {}], [0])).not.toThrow();
  const nodes = Array.from({ length: 140 }, (_, index) => ({ children: index < 139 ? [index + 1] : [] }));
  expect(() => validateNodeGraph(nodes, [0])).toThrow(RangeError);
});
it("checks total depth even when a subtree was validated through another root first", () => {
  const nodes = Array.from({length:140},(_,index)=>({children:index<139?[index+1]:[]}));
  expect(()=>validateNodeGraph(nodes,Array.from({length:140},(_,index)=>139-index))).toThrow(RangeError);
});
