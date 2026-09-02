export interface EquidistantProjectionProfile {
  readonly kind: "equidistant";
  readonly thetaMaxRadians: number;
  readonly blendRadians: number;
  readonly rotationRadians: number;
}

export interface MeiLensProfile {
  readonly xi: number;
  readonly focal: readonly [number, number];
  readonly center: readonly [number, number];
  readonly radial: readonly [number, number, number, number];
  readonly tangential: readonly [number, number];
  readonly prism: readonly [number, number, number, number];
  /** Column-major lens-to-camera rotation for WebGL. */
  readonly rotation: readonly [number, number, number, number, number, number, number, number, number];
  readonly textureRotationRadians: number;
}

export interface MeiProjectionProfile {
  readonly kind: "mei";
  readonly blendRadians: number;
  readonly lenses: readonly [MeiLensProfile, MeiLensProfile];
}

export interface EquirectangularProjectionProfile {
  readonly kind: "equirectangular";
  readonly blendRadians: 0;
}

export interface CalibratedEquidistantLensProfile {
  readonly focal: readonly [number, number];
  readonly center: readonly [number, number];
  readonly rotation: MeiLensProfile["rotation"];
  readonly textureRotationRadians: number;
}

export interface CalibratedEquidistantProjectionProfile {
  readonly kind: "calibrated-equidistant";
  readonly blendRadians: number;
  readonly lenses: readonly [CalibratedEquidistantLensProfile, CalibratedEquidistantLensProfile];
}

export type PanoramaProjectionProfile = EquidistantProjectionProfile | CalibratedEquidistantProjectionProfile
  | MeiProjectionProfile | EquirectangularProjectionProfile;

const BLEND_RADIANS = 8 * Math.PI / 180;
const degrees = (value: number) => value * Math.PI / 180;

export const EQUIRECTANGULAR_PROJECTION = {
  kind: "equirectangular", blendRadians: 0,
} satisfies EquirectangularProjectionProfile;

export const X3_PHOTO_PROJECTION = {
  kind: "equidistant", thetaMaxRadians: degrees(98.5), blendRadians: BLEND_RADIANS, rotationRadians: 0,
} satisfies EquidistantProjectionProfile;

export const X3_VIDEO_PROJECTION = {
  kind: "equidistant", thetaMaxRadians: degrees(95.75), blendRadians: BLEND_RADIANS, rotationRadians: 0,
} satisfies EquidistantProjectionProfile;

// Calibrated from 40 cross-lens SIFT correspondences in the X4 LRV sample
// (median angular residual 0.19 degrees).
export const X4_VIDEO_PROJECTION = {
  kind: "calibrated-equidistant",
  blendRadians: BLEND_RADIANS,
  lenses: [
    { focal: [247.522091 / 832, 247.522091 / 832], center: [409.783528 / 832, 416.637972 / 832], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], textureRotationRadians: 0 },
    { focal: [251.642756 / 832, 251.642756 / 832], center: [420.563692 / 832, 417.026752 / 832], rotation: [-0.99890391, -0.01227454, 0.04516981, -0.01252452, 0.99990775, -0.00525534, -0.04510114, -0.00581531, -0.9989655], textureRotationRadians: 0 },
  ],
} satisfies CalibratedEquidistantProjectionProfile;

function rotation(yawDegrees: number, pitchDegrees: number, back = false): MeiLensProfile["rotation"] {
  const yaw = degrees(yawDegrees + (back ? 180 : 0));
  const pitch = degrees(pitchDegrees);
  const cy = Math.cos(yaw); const sy = Math.sin(yaw);
  const cx = Math.cos(pitch); const sx = Math.sin(pitch);
  return [cy, 0, -sy, sy * sx, cx, cy * sx, sy * cx, -sx, cy * cx];
}

function meiLens(
  xi: number,
  focal: readonly [number, number],
  center: readonly [number, number],
  radial: readonly [number, number, number, number],
  tangential: readonly [number, number],
  yaw: number,
  pitch: number,
  back: boolean,
  textureRotationRadians = 0,
  prism: readonly [number, number, number, number] = [0, 0, 0, 0],
): MeiLensProfile {
  return { xi, focal, center, radial, tangential, prism, rotation: rotation(yaw, pitch, back), textureRotationRadians };
}

export function projectionFromInsvCalibration(
  offset: readonly number[] | undefined,
  cropWidth: number | undefined,
  cropHeight: number | undefined,
): MeiProjectionProfile | undefined {
  if (!offset || offset.length !== 40 || offset[0] !== 2 || !cropWidth || !cropHeight) return undefined;
  const lenses = ([1, 20] as const).map((start, lensIndex) => {
    const sensorWidth = offset[start + 16];
    const sensorHeight = offset[start + 17];
    if (!(sensorWidth > 0) || !(sensorHeight > 0)) return undefined;
    const localCenterX = offset[start + 3] - (lensIndex === 1 ? sensorWidth / 2 : 0);
    return meiLens(
      offset[start],
      [offset[start + 1] / cropWidth, offset[start + 2] / cropHeight],
      [localCenterX * 2 / sensorWidth, offset[start + 4] / sensorHeight],
      [offset[start + 11], offset[start + 12], offset[start + 13], 0],
      [offset[start + 14], offset[start + 15]],
      offset[start + 5],
      offset[start + 6],
      lensIndex === 1,
    );
  });
  return lenses[0] && lenses[1] ? { kind: "mei", blendRadians: BLEND_RADIANS, lenses: [lenses[0], lenses[1]] } : undefined;
}

export const ONE_RS_VIDEO_PROJECTION = {
  kind: "mei",
  blendRadians: BLEND_RADIANS,
  lenses: [
    meiLens(2.01493, [2873.0496 / 3072, 2872.6272 / 3072], [1511.32235 / 3072, 1529.76 / 3072], [0.2350903, -0.32572556, -0.95795417, 0], [0.00186, 0.00003364], -0.045, -0.138, false, Math.PI),
    meiLens(2.01493, [2867.541 / 3072, 2867.12 / 3072], [1511.821 / 3072, 1527.328 / 3072], [0.2350903, -0.32572556, -0.95795417, 0], [0.00186, 0.00003364], 0.15, -0.366, true, Math.PI),
  ],
} satisfies MeiProjectionProfile;

export const X4_INSV_PROJECTION = projectionFromInsvCalibration([
  2, 1.94817, 4618.37, 4617.04, 3996.93, 3002.96, -0.616, 0.341, 89.501, 0, 0, 0, 0.37601721, 1.41075909, -4.22507524, -0.00143595, 0.00058836, 16000, 6000, 71,
  1.94817, 4606.88, 4607.84, 11994.35, 3006.73, 0.6, 0.296, 89.965, 0.000769, 0.000071, -0.032337, 0.3798646, 1.36779749, -4.10814619, -0.00046989, 0.00116828, 16000, 6000, 71, 197632,
], 5632, 5632)!;

export const X5_VIDEO_PROJECTION = {
  kind: "mei",
  blendRadians: BLEND_RADIANS,
  lenses: [
    meiLens(2, [3086.40723 / 3840, 3086.50843 / 3840], [1920.27857 / 3840, 1930.92143 / 3840], [0.18702514, 2.0107255, -3.01867962, 0], [-0.00028597, -0.00027196], 0.372, -0.441, false),
    meiLens(2, [3093.078 / 3840, 3093.18 / 3840], [1930.239 / 3840, 1923.408 / 3840], [0.18702514, 2.0107255, -3.01867962, 0], [-0.00028597, -0.00027196], -0.361, -0.363, true),
  ],
} satisfies MeiProjectionProfile;

const X6_SENSOR_WIDTH = 7744;
export const X6_PROJECTION = {
  kind: "mei",
  blendRadians: BLEND_RADIANS,
  lenses: [
    meiLens(2.45543, [7223.29 / X6_SENSOR_WIDTH, 7223.29 / X6_SENSOR_WIDTH], [3884.91 / X6_SENSOR_WIDTH, 3885.34 / X6_SENSOR_WIDTH], [1.29362047, -1.10706389, 2.27372193, 10.8041563], [-0.00002527, 0.00146495], 0.393, 0.143, false, 0, [-0.00030103, 0.00984209, 0.00137046, -0.00292292]),
    meiLens(2.45543, [7213.84 / X6_SENSOR_WIDTH, 7213.84 / X6_SENSOR_WIDTH], [(11595 - X6_SENSOR_WIDTH) / X6_SENSOR_WIDTH, 3879.22 / X6_SENSOR_WIDTH], [1.30818784, -1.36184096, 4.81643343, 4.51237011], [0.00106177, 0.00013898], -0.129, 0.37, true, 0, [-0.00009224, 0.01048734, -0.00270038, -0.00115367]),
  ],
} satisfies MeiProjectionProfile;

export interface LensProjection { readonly lens: 0 | 1; readonly u: number; readonly v: number; readonly angle: number }
type Direction = readonly [number, number, number];
const dot = (a: Direction, b: Direction) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function projectDirectionToLens(direction: Direction, lens: 0 | 1, projection: PanoramaProjectionProfile): LensProjection | undefined {
  if (projection.kind !== "equidistant") return undefined;
  const forward: Direction = lens === 0 ? [0, 0, -1] : [0, 0, 1];
  const right: Direction = lens === 0 ? [1, 0, 0] : [-1, 0, 0];
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(direction, forward))));
  if (angle > projection.thetaMaxRadians) return undefined;
  const sine = Math.sin(angle);
  const radius = angle / projection.thetaMaxRadians * 0.5;
  const radialX = sine > 1e-6 ? dot(direction, right) / sine : 0;
  const radialY = sine > 1e-6 ? direction[1] / sine : 0;
  const cosine = Math.cos(projection.rotationRadians); const rotationSine = Math.sin(projection.rotationRadians);
  return { lens, u: 0.5 + radius * (cosine * radialX - rotationSine * radialY), v: 0.5 - radius * (rotationSine * radialX + cosine * radialY), angle };
}

export function lensZeroBlendWeight(direction: Direction, projection: PanoramaProjectionProfile) {
  const first = projectDirectionToLens(direction, 0, projection);
  const second = projectDirectionToLens(direction, 1, projection);
  if (!first) return 0;
  if (!second) return 1;
  const value = Math.min(1, Math.max(0, (second.angle - first.angle + projection.blendRadians) / (2 * projection.blendRadians)));
  return value * value * (3 - 2 * value);
}
