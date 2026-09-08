import { Box3, Matrix4, Vector3 } from "three";
import type { DrawingBatch, DrawingData, DrawingText, Tuple3 } from "./types";
import { MAX_TEXTS, MAX_VERTICES } from "./types";
export interface Style { layer: string; color: number }
export class SceneBuilder {
  private readonly batches = new Map<string, { style: Style; kind: DrawingBatch["kind"]; values: number[] }>();
  readonly texts: DrawingText[] = [];
  readonly warnings: Record<string, number> = Object.create(null);
  readonly bounds = new Box3();
  vertices = 0;
  entities = 0;
  private textCharacters = 0;
  warn(reason: string) { this.warnings[reason] = (this.warnings[reason] ?? 0)+1; }
  private point(p: Vector3, matrix: Matrix4) {
    const point = p.clone().applyMatrix4(matrix);
    if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("Non-finite DWG geometry");
    this.bounds.expandByPoint(point);
    return point;
  }
  add(points: Vector3[], style: Style, matrix: Matrix4, kind: DrawingBatch["kind"] = "lines", segments = false) {
    const count = kind === "lines" && !segments ? Math.max(0, points.length-1)*2 : points.length;
    if ((this.vertices += count) > MAX_VERTICES) throw new RangeError("DWG vertex budget");
    const key = `${style.layer}\0${style.color}\0${kind}`;
    let batch = this.batches.get(key);
    if (!batch) { batch = { style, kind, values: [] }; this.batches.set(key, batch); }
    const mapped = points.map(p => this.point(p, matrix));
    if (kind === "lines" && !segments) for (let i = 1; i < mapped.length; i++) batch.values.push(...mapped[i-1].toArray(), ...mapped[i].toArray());
    else for (const point of mapped) batch.values.push(...point.toArray());
  }
  text(text: Omit<DrawingText, "position" | "xAxis" | "yAxis">, position: Vector3, x: Vector3, y: Vector3, matrix: Matrix4) {
    this.textCharacters += text.text.length;
    if (this.texts.length >= MAX_TEXTS || this.textCharacters > 100_000) throw new RangeError("DWG text budget");
    const anchor = this.point(position, matrix);
    const xAxis = this.point(position.clone().add(x), matrix).sub(anchor);
    const yAxis = this.point(position.clone().add(y), matrix).sub(anchor);
    this.texts.push({ ...text, position: anchor.toArray(), xAxis: xAxis.toArray(), yAxis: yAxis.toArray() });
  }
  finish(layers: Record<string, boolean>, units: number | undefined): DrawingData {
    if (this.bounds.isEmpty()) throw new Error("DWG has no supported visible geometry");
    const origin = this.bounds.getCenter(new Vector3()).toArray() as Tuple3;
    const batches = [...this.batches.values()].filter(b => b.values.length).map(b => ({ ...b.style, kind: b.kind,
      positions: Float32Array.from(b.values, (v, i) => v-origin[i%3]) }));
    for (const t of this.texts) t.position = t.position.map((v, i) => v-origin[i]) as Tuple3;
    return { batches, texts: this.texts, layers, origin, units, entityCount: this.entities,
      vertexCount: this.vertices, warnings: this.warnings, parserWarnings: 0, heapBytes: 0 };
  }
}
