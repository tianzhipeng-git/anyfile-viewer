export const X3_THETA_MAX_RADIANS = 105 * Math.PI / 180;
export const X3_BLEND_RADIANS = 8 * Math.PI / 180;

export interface LensProjection {
  readonly lens: 0 | 1;
  readonly u: number;
  readonly v: number;
  readonly angle: number;
}

type Direction = readonly [number, number, number];

function dot(left: Direction, right: Direction) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function projectDirectionToLens(direction: Direction, lens: 0 | 1): LensProjection | undefined {
  const forward: Direction = lens === 0 ? [0, 0, -1] : [0, 0, 1];
  const right: Direction = lens === 0 ? [1, 0, 0] : [-1, 0, 0];
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(direction, forward))));
  if (angle > X3_THETA_MAX_RADIANS) return undefined;
  const sine = Math.sin(angle);
  const radius = angle / X3_THETA_MAX_RADIANS * 0.5;
  const radialX = sine > 1e-6 ? dot(direction, right) / sine : 0;
  const radialY = sine > 1e-6 ? direction[1] / sine : 0;
  return { lens, u: 0.5 + radius * radialX, v: 0.5 - radius * radialY, angle };
}

export function lensZeroBlendWeight(direction: Direction) {
  const first = projectDirectionToLens(direction, 0);
  const second = projectDirectionToLens(direction, 1);
  if (!first) return 0;
  if (!second) return 1;
  const value = Math.min(1, Math.max(0, (second.angle - first.angle + X3_BLEND_RADIANS) / (2 * X3_BLEND_RADIANS)));
  return value * value * (3 - 2 * value);
}
