/** Conservative dimensions from every HEIF ImageSpatialExtentsProperty.
 * Grid/derived images also carry ispe; taking maxima includes the output and tiles.
 * Only the metadata property hierarchy is walked, never compressed image payloads.
 */
export function avifDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0,
    boxes = 0;
  const regions: { start: number; end: number; kind: string }[] = [
    { start: 0, end: bytes.length, kind: "root" },
  ];
  while (regions.length) {
    const region = regions.pop()!;
    let offset = region.start;
    while (offset + 8 <= region.end) {
      if (++boxes > 4096) return undefined;
      let size = data.getUint32(offset),
        header = 8;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (size === 1) {
        if (offset + 16 > region.end) return undefined;
        const large = data.getBigUint64(offset + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
        size = Number(large);
        header = 16;
      }
      if (size === 0) size = region.end - offset;
      if (size < header || offset + size > region.end) return undefined;
      const start = offset + header,
        end = offset + size;
      if (region.kind === "root" && type === "meta") {
        if (start + 4 > end) return undefined;
        regions.push({ start: start + 4, end, kind: "meta" });
      } else if (region.kind === "meta" && type === "iprp")
        regions.push({ start, end, kind: "iprp" });
      else if (region.kind === "iprp" && type === "ipco")
        regions.push({ start, end, kind: "ipco" });
      else if (region.kind === "ipco" && type === "ispe") {
        if (end - start !== 12 || data.getUint32(start) !== 0) return undefined;
        const w = data.getUint32(start + 4),
          h = data.getUint32(start + 8);
        if (!w || !h) return undefined;
        width = Math.max(width, w);
        height = Math.max(height, h);
      }
      offset = end;
    }
    if (offset !== region.end) return undefined;
  }
  return width && height ? { width, height } : undefined;
}
