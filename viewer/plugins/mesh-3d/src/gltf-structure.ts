export function validateNodeGraph(nodes: { children?: number[] }[], roots: number[]) {
  const complete = new Map<number, number>(); const active = new Set<number>();
  const visit = (index: number, depth: number): number => {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length) throw new Error("Invalid glTF node index");
    if (active.has(index)) throw new Error("Cyclic glTF nodes");
    if (depth > 128) throw new RangeError("glTF hierarchy depth");
    if (complete.has(index)) {
      const height = complete.get(index)!; if (depth + height > 128) throw new RangeError("glTF hierarchy depth"); return height;
    }
    active.add(index);
    const children = nodes[index].children ?? [];
    if (!Array.isArray(children) || children.length > 4096) throw new Error("Invalid glTF children");
    let height = 0;
    for (const child of children) height = Math.max(height, 1 + visit(child, depth + 1));
    active.delete(index); complete.set(index, height); return height;
  };
  for (const root of roots) visit(root, 0);
  // Unreferenced nodes can still be resolved by skins/animations.
  for (let index = 0; index < nodes.length; index++) visit(index, 0);
}
