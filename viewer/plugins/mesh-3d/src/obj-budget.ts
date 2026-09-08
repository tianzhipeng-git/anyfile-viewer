// OBJLoader expands indexed faces into unindexed attribute arrays. Count that
// expansion before parsing, rather than checking only the source byte length.
export function checkObjBudget(source: string) {
  source = source.replace(/\r\n/g, "\n").replace(/\\\n/g, "");
  let vertices = 0, attributes = 0, expanded = 0, groups = 0;
  for (const match of source.matchAll(/[^\r\n]+/g)) {
    const line = match[0].trim();
    if (line.startsWith("#")) continue;
    if (line.length > 65536) throw new RangeError("OBJ record budget");
    const kind = /^(\S+)/.exec(line)?.[1];
    if (kind === "v") vertices++;
    if (kind === "vn" || kind === "vt") attributes++;
    if (kind === "o" || kind === "g" || kind === "usemtl") groups++;
    if (kind === "f" || kind === "l" || kind === "p") {
      const count = line.split("#",1)[0].split(/\s+/).length - 1;
      expanded += kind === "f" ? Math.max(0,count - 2) * 3 : kind === "l" ? Math.max(0,count - 1) * 2 : count;
    }
    if (vertices > 2_000_000 || attributes > 4_000_000 || expanded > 3_000_000 || groups > 4096) throw new RangeError("OBJ expanded geometry budget");
  }
  return source;
}
