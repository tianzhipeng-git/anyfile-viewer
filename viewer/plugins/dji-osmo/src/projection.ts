export interface DjiOsmoLensProfile {
  readonly focal: number;
  readonly center: readonly [number, number];
  readonly rotationRadians: number;
}

export const DJI_OSMO_VIDEO_PROJECTION = {
  thetaMaxRadians: 100 * Math.PI / 180,
  blendRadians: 8 * Math.PI / 180,
  lenses: [
    { focal: 0.2902677464, center: [0.5018217246, 0.5017294851], rotationRadians: -0.005655584 },
    { focal: 0.2882550974, center: [0.5047001077, 0.5061643697], rotationRadians: -0.006368623 },
  ],
} as const satisfies {
  readonly thetaMaxRadians: number;
  readonly blendRadians: number;
  readonly lenses: readonly [DjiOsmoLensProfile, DjiOsmoLensProfile];
};

type Direction = readonly [number, number, number];

export function projectDjiOsmoDirection(direction: Direction, lens: 0 | 1) {
  const profile = DJI_OSMO_VIDEO_PROJECTION.lenses[lens];
  const forwardZ = lens === 0 ? -1 : 1;
  const rightX = lens === 0 ? 1 : -1;
  const angle = Math.acos(Math.min(1, Math.max(-1, direction[2] * forwardZ)));
  if (angle > DJI_OSMO_VIDEO_PROJECTION.thetaMaxRadians) return undefined;
  const sine = Math.sin(angle);
  let radialX = sine > 1e-6 ? direction[0] * rightX / sine : 0;
  let radialY = sine > 1e-6 ? direction[1] / sine : 0;
  const cosine = Math.cos(profile.rotationRadians);
  const rotationSine = Math.sin(profile.rotationRadians);
  [radialX, radialY] = [cosine * radialX - rotationSine * radialY, rotationSine * radialX + cosine * radialY];
  const u = profile.center[0] + profile.focal * radialX * angle;
  const v = profile.center[1] - profile.focal * radialY * angle;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? { u, v, angle } : undefined;
}
