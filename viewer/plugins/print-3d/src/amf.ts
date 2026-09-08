import { Color, Group } from "three";
import { child, children, number, parseXml } from "./xml";
import { mesh } from "./model";
import { disposeObject } from "@anyfile/rendering-3d";
export function loadAmf(source: string) {
  const xml = parseXml(source); if (xml.localName !== "amf") throw new Error("Invalid AMF");
  if (children(xml, "constellation").length) throw new Error("AMF constellations are not implemented");
  const root = new Group();
  let vertexCount = 0, indexCount = 0, volumeCount = 0;
  const color = (element: Element | undefined) => {
    const value = element && children(element, "color")[0];
    if (!value) return undefined;
    const channels = ["r", "g", "b"].map(channel => number(child(value, channel).textContent));
    if (channels.some(n => n < 0 || n > 1)) throw new Error("Invalid AMF color");
    return `#${new Color(...channels as [number, number, number]).getHexString()}`;
  };
  const materials = new Map(children(xml, "material").map(material => [material.getAttribute("id"), color(material)]));
 const unit = xml.getAttribute("unit") || "millimeter";
  if (!["millimeter", "meter", "micron", "inch", "feet"].includes(unit)) throw new Error("Invalid AMF unit");
  try {
    for (const object of children(xml, "object")) {
      if (root.children.length > 4096) throw new RangeError();
      const geometry = child(object, "mesh");
      const positions = children(child(geometry, "vertices"), "vertex").flatMap(vertex => { const coordinates = child(vertex, "coordinates"); return ["x", "y", "z"].map(axis => number(child(coordinates, axis).textContent)); });
      const group = new Group(); group.name = object.getAttribute("id") || "AMF"; root.add(group);
      for (const volume of children(geometry, "volume")) {
        const indices = children(volume, "triangle").flatMap(triangle => ["v1", "v2", "v3"].map(axis => number(child(triangle, axis).textContent)));
        vertexCount += positions.length / 3; indexCount += indices.length;
        if (++volumeCount > 4096 || vertexCount > 2_000_000 || indexCount > 6_000_000) throw new RangeError("AMF total geometry budget");
        group.add(mesh(positions, indices, color(volume) || materials.get(volume.getAttribute("materialid")) || color(object)));
      }
    }
    return { root, up: "z" as const, units: unit };
  } catch (error) { disposeObject(root); throw error; }
}
