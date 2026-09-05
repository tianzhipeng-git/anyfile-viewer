import { BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Points, PointsMaterial, Sprite, SpriteMaterial, Vector3 } from "three";
import type { Rendering3dDocument } from "@anyfile/rendering-3d";
import type { CadPoint, CadScene } from "./scene";

export function cadDocument(scene: CadScene): Rendering3dDocument {
  const root = new Group();
  const allPoints = scene.primitives.flatMap(p => "points" in p ? [...p.points] : [p.position]);
  const origin = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of allPoints) { origin.min(new Vector3(p.x, p.y, p.z ?? 0)); maximum.max(new Vector3(p.x, p.y, p.z ?? 0)); }
  origin.add(maximum).multiplyScalar(0.5);
  const positions = (p: CadPoint) => [p.x - origin.x, p.y - origin.y, (p.z ?? 0) - origin.z];
  const layers = new Map<string, { group: Group; lines: number[]; colors: number[] }>();
  for (const primitive of scene.primitives) {
    let layer = layers.get(primitive.layer);
    if (!layer) { const group = new Group(); group.name = primitive.layer || "0"; group.visible = scene.layers[primitive.layer] !== false; layer = { group, lines: [], colors: [] }; layers.set(primitive.layer, layer); root.add(group); }
    // Keep CAD black/white index colors legible against either host theme.
    const color = new Color(primitive.color === "#ffffff" || primitive.color === "#111111" ? "#718096" : primitive.color);
    if (primitive.kind === "line" || primitive.kind === "polyline") {
      const points = primitive.points;
      const count = points.length - 1 + (primitive.kind === "polyline" && primitive.closed ? 1 : 0);
      for (let i = 0; i < count; i++) { layer.lines.push(...positions(points[i]), ...positions(points[(i + 1) % points.length])); layer.colors.push(...color.toArray(), ...color.toArray()); }
    } else if (primitive.kind === "solid") {
      const points = primitive.points; const values: number[] = [];
      for (let i = 1; i + 1 < points.length; i++) values.push(...positions(points[0]), ...positions(points[i]), ...positions(points[i + 1]));
      const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(values, 3));
      layer.group.add(new Mesh(geometry, new MeshBasicMaterial({ color, side: DoubleSide })));
    } else if (primitive.kind === "point") {
      const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions(primitive.position), 3));
      layer.group.add(new Points(geometry, new PointsMaterial({ color, size: 3, sizeAttenuation: false })));
    } else {
      const canvas = document.createElement("canvas"); const context = canvas.getContext("2d");
      if (!context) continue;
      canvas.width = Math.min(2048, Math.max(32, primitive.text.length * 24)); canvas.height = 48;
      context.font = "32px sans-serif"; context.fillStyle = color.getStyle(); context.textBaseline = "bottom"; context.fillText(primitive.text, 0, 40);
      const material = new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, rotation: primitive.rotation * Math.PI / 180 });
      const text = new Sprite(material); text.position.fromArray(positions(primitive.position)); text.center.set(0, 0);
      text.scale.set(primitive.height * canvas.width / 32, primitive.height * 1.5, 1); layer.group.add(text);
    }
  }
  for (const { group, lines, colors } of layers.values()) if (lines.length) {
    const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(lines, 3)); geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    group.add(new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true })));
  }
  root.userData.origin = origin.toArray();
  return { root, up: "z", planar: allPoints.every(p => Math.abs((p.z ?? 0) - origin.z) < 1e-8), units: ({ 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" } as Record<number, string>)[scene.units ?? 0] };
}
