import type { IfcAPI } from "web-ifc";
import { isIfcHeader } from "./probe";
import type { IfcData } from "./types";

// Limits cover decoded output separately from the 128 MiB source allowance.
export function parseIfc(api: IfcAPI, bytes: Uint8Array): IfcData {
  if (bytes.byteLength > 128 * 1024 * 1024) throw new RangeError("IFC input budget");
  if (!isIfcHeader(new TextDecoder().decode(bytes.subarray(0, 65536)))) throw new Error("Invalid IFC header");
  const model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true, MEMORY_LIMIT: 512 * 1024 * 1024, ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: false });
  if (model < 0) throw new Error("Invalid IFC model");
  try {
    const result: IfcData = { schema: api.GetModelSchema(model), geometries: [], elements: [] };
    const seen = new Set<number>();
    const empty = new Set<number>();
    let vertices = 0, outputBytes = 0, draws = 0;
    api.StreamAllMeshes(model, (mesh) => {
      const parts: IfcData["elements"][number]["parts"] = [];
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const part = mesh.geometries.get(i);
        const id = part.geometryExpressID;
        if (empty.has(id)) continue;
        if (!seen.has(id)) {
          const geometry = api.GetGeometry(model, id);
          try {
            const count = geometry.GetVertexDataSize(), indexCount = geometry.GetIndexDataSize();
            // Axis/curve representations can legitimately produce no triangle mesh.
            if (!count && !indexCount) { empty.add(id); continue; }
            if (!count || count % 6 || indexCount % 3) throw new Error("Invalid IFC geometry");
            vertices += count / 6; outputBytes += (count + indexCount) * 4;
            if (vertices > 6_000_000 || outputBytes > 256 * 1024 * 1024) throw new RangeError("IFC geometry budget");
            const vertexData = api.GetVertexArray(geometry.GetVertexData(), count);
            const indices = api.GetIndexArray(geometry.GetIndexData(), indexCount);
            if (!vertexData.every(Number.isFinite) || !indices.every(index => index < count / 6)) throw new Error("Invalid IFC geometry");
            result.geometries.push({ id, vertices: vertexData, indices }); seen.add(id);
          } finally { geometry.delete(); }
        }
        if (++draws > 4096) throw new RangeError("IFC draw budget");
        const color = [part.color.x, part.color.y, part.color.z, part.color.w];
        if (part.flatTransformation.length !== 16 || !part.flatTransformation.every(Number.isFinite) || !color.every(Number.isFinite)) throw new Error("Invalid IFC placement");
        parts.push({ geometry: id, transform: [...part.flatTransformation], color });
      }
      if (parts.length) {
        const line = api.GetLine(model, mesh.expressID, false);
        const type = api.GetNameFromTypeCode(line.type);
        const name = typeof line.Name?.value === "string" ? line.Name.value.slice(0, 512) : type;
        result.elements.push({ id: mesh.expressID, name, type, parts });
      }
    });
    if (!result.elements.length) throw new Error("No visible IFC geometry");
    return result;
  } finally { api.CloseModel(model); }
}
