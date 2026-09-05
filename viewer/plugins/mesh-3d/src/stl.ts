export function parseStl(bytes: ArrayBuffer) {
  const view = new DataView(bytes); const count = bytes.byteLength >= 84 ? view.getUint32(80, true) : 0;
  const binary = bytes.byteLength >= 84 && 84 + count * 50 === bytes.byteLength;
  let positions: Float64Array;
  if (binary) {
    if (!count) throw new Error("Empty STL");
    if (count > 1_000_000) throw new RangeError("Triangle limit");
    positions = new Float64Array(count * 9);
    for (let face = 0; face < count; face++) for (let i = 0; i < 9; i++) positions[face * 9 + i] = view.getFloat32(84 + face * 50 + 12 + i * 4, true);
  } else {
    const source = new TextDecoder().decode(bytes);
    if (!/^\s*solid\b/.test(source) || !/endsolid[^\r\n]*\s*$/.test(source)) throw new Error("Invalid STL");
    const values: number[] = [];
    const number = "([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)";
    const facet = new RegExp(`facet\\s+normal\\s+${number}\\s+${number}\\s+${number}\\s+outer\\s+loop\\s+vertex\\s+${number}\\s+${number}\\s+${number}\\s+vertex\\s+${number}\\s+${number}\\s+${number}\\s+vertex\\s+${number}\\s+${number}\\s+${number}\\s+endloop\\s+endfacet`, "g");
    let faces = 0;
    const body = source.replace(/^\s*solid[^\r\n]*(?:\r?\n|$)/, "").replace(/endsolid[^\r\n]*\s*$/, "");
    const remaining = body.replace(facet, (...args: unknown[]) => {
      if (++faces > 1_000_000) throw new RangeError("Triangle limit");
      for (let i = 4; i <= 12; i++) values.push(Number(args[i]));
      return "";
    });
    if (remaining.trim() || !faces) throw new Error("Invalid facets");
    positions = new Float64Array(values);
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const value = positions[i]; if (!Number.isFinite(value)) throw new Error("Non-finite STL");
    min[i % 3] = Math.min(min[i % 3], value); max[i % 3] = Math.max(max[i % 3], value);
  }
  const origin = min.map((value, i) => value / 2 + max[i] / 2);
  const local = Float32Array.from(positions, (value, i) => value - origin[i % 3]);
  return { positions: local, origin, triangles: local.length / 9 };
}
