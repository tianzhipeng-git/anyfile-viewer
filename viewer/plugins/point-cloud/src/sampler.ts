export class PointSampler {
  readonly positions: Float64Array;
  count = 0;
  private origin = [0, 0, 0];
  private state = 123456789;
  constructor(readonly capacity = 200_000) { this.positions = new Float64Array(capacity * 3); }
  add(x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite)) throw new Error("Invalid point");
    if (!this.count) this.origin = [x, y, z];
    const count = ++this.count;
    this.state ^= this.state << 13; this.state ^= this.state >>> 17; this.state ^= this.state << 5;
    const index = count <= this.capacity ? count - 1 : Math.floor((this.state >>> 0) / 4294967296 * count);
    if (index < this.capacity) this.positions.set([x, y, z], index * 3);
  }
  snapshot() {
    const points = this.positions.subarray(0, Math.min(this.count, this.capacity) * 3);
    const origin = this.origin;
    return { count: this.count, origin, positions: Float32Array.from(points, (n, i) => n - origin[i % 3]) };
  }
}
