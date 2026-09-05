import { BlobReader, ZipReader, type FileEntry } from "@zip.js/zip.js";
import { Group, Matrix4, type Mesh } from "three";
import { parseXml, child, children, number } from "./xml";
import { mesh } from "./model";
import { disposeObject } from "@anyfile/rendering-3d";

function transform(value: string | null) {
  if (!value) return new Matrix4();
  const n = value.trim().split(/\s+/).map(number);
  if (n.length !== 12) throw new Error("Invalid transform");
  return new Matrix4().set(n[0], n[3], n[6], n[9], n[1], n[4], n[7], n[10], n[2], n[5], n[8], n[11], 0, 0, 0, 1);
}
export function parse3mf(source: string) {
  const xml = parseXml(source); if (xml.localName !== "model") throw new Error("Invalid 3MF model");
  if (xml.getAttribute("requiredextensions")) throw new Error("Unsupported required 3MF extension");
  const unit = xml.getAttribute("unit") || "millimeter";
  if (!["micron", "millimeter", "centimeter", "inch", "foot", "meter"].includes(unit)) throw new Error("Invalid unit");
  const resources = child(xml, "resources"); const objects = new Map<string, Element>();
  for (const object of children(resources, "object")) { const id = object.getAttribute("id"); if (!id || objects.has(id)) throw new Error("Invalid object ID"); objects.set(id, object); }
  if (objects.size > 4096) throw new RangeError();
  const materials = new Map<string, string[]>();
  for (const bases of children(resources, "basematerials")) materials.set(bases.getAttribute("id")!, children(bases, "base").map(base => base.getAttribute("displaycolor")?.slice(0, 7) || "#87a9bc"));
  const root = new Group(); let instances = 0; let vertices = 0; let indicesCount = 0;
  const meshes = new Map<string, Mesh>();
  const buildObject = (id: string, active: Set<string>, parent: Group): Group => {
    if (active.has(id)) throw new Error("Cyclic component");
    if (++instances > 4096 || active.size > 32) throw new RangeError();
    const element = objects.get(id); if (!element) throw new Error("Missing component");
    const group = new Group(); group.name = element.getAttribute("name") || id; parent.add(group);
    active = new Set(active).add(id);
    const geometry = children(element, "mesh")[0];
    if (geometry) {
      const cached = meshes.get(id);
      if (cached) { group.add(cached.clone()); return group; }
      const positions = children(child(geometry, "vertices"), "vertex").flatMap(vertex => ["x", "y", "z"].map(axis => number(vertex.getAttribute(axis))));
      const indices = children(child(geometry, "triangles"), "triangle").flatMap(triangle => ["v1", "v2", "v3"].map(key => number(triangle.getAttribute(key))));
      vertices += positions.length / 3; indicesCount += indices.length;
      if (vertices > 2_000_000 || indicesCount > 6_000_000) throw new RangeError("3MF total geometry budget");
      const color = materials.get(element.getAttribute("pid") || "")?.[Number(element.getAttribute("pindex") || 0)];
      const object = mesh(positions, indices, color); meshes.set(id, object); group.add(object);
    } else for (const component of children(child(element, "components"), "component")) {
      const result = buildObject(component.getAttribute("objectid") || "", active, group); result.applyMatrix4(transform(component.getAttribute("transform"))); group.add(result);
    }
    return group;
  };
  try {
    for (const item of children(child(xml, "build"), "item")) { const object = buildObject(item.getAttribute("objectid") || "", new Set(), root); object.applyMatrix4(transform(item.getAttribute("transform"))); root.add(object); }
    return { root, up: "z" as const, units: unit };
  } catch (error) { disposeObject(root); throw error; }
}
export async function load3mf(file: File, signal: AbortSignal) {
  const zip = new ZipReader(new BlobReader(file), { useWebWorkers: false });
  try {
    let total = 0; const entries: FileEntry[] = [];
    for await (const entry of zip.getEntriesGenerator()) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (entry.directory) continue;
      total += entry.uncompressedSize;
      if (entries.length >= 2048 || total > 64 * 1024 * 1024 || entry.uncompressedSize > 32 * 1024 * 1024 || entry.uncompressedSize > Math.max(1024, entry.compressedSize) * 200) throw new RangeError();
      if (entry.encrypted || /(^\/|\\|(^|\/)\.\.($|\/))/.test(entry.filename)) throw new Error("Unsafe ZIP entry");
      entries.push(entry);
    }
    const readText = async (entry: (typeof entries)[number]) => {
      if (!entry.getData) throw new Error("Not a file");
      let bytes = 0; let text = ""; const decoder = new TextDecoder("utf-8", { fatal: true });
      const output = new WritableStream<Uint8Array>({ write(chunk) {
        bytes += chunk.length; if (bytes > entry.uncompressedSize || bytes > 32 * 1024 * 1024) throw new RangeError();
        text += decoder.decode(chunk, { stream: true });
      } });
      await entry.getData(output, { signal, checkSignature: true }); text += decoder.decode(); return text;
    };
    const relationships = entries.find(e => e.filename === "_rels/.rels"); if (!relationships?.getData) throw new Error("Missing package relationships");
    const rels = parseXml(await readText(relationships));
    const rel = children(rels, "Relationship").find(e => e.getAttribute("Type")?.endsWith("/3dmodel"));
    if (!rel || rel.getAttribute("TargetMode") === "External") throw new Error("Invalid model relationship");
    const target = rel.getAttribute("Target")?.replace(/^\//, "");
    const entry = entries.find(e => e.filename === target); if (!entry?.getData) throw new Error("Missing 3MF model");
    return parse3mf(await readText(entry));
  } finally { await zip.close(); }
}
