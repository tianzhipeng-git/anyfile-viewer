# CAD DXF viewer (`cad-2d`)

The existing ID remains the sole DXF registration. ASCII DXF is parsed in a
terminable Worker, retaining XYZ coordinates, and displayed through
`@anyfile/rendering-3d` (Three.js 0.185.1). Input is local and read-only.

- Probe reads at most 64 KiB; binary DXF remains unsupported.
- Input limit: 64 MiB; 200,000 expanded entities; 3,000,000 primitive vertices.
- Lines/points/solids, sampled curves, block transforms and text sprites.
- Top/front/right/isometric, orbit/pan/zoom/fit, orthographic/perspective.
- Layer visibility honors off/frozen defaults, with show-all and solo controls.
- GPU coordinates are rebased before Float32 conversion; units are preserved.
- Abort terminates parsing; dispose releases renderer, controls, frames and geometry.

General OCS extrusion, precise spline evaluation, paper space, native fonts,
advanced dimensions, hatch fidelity and DWG remain outside the current path.
Text sprites face the camera. This is level 3 viewing, not full CAD fidelity.

See `docs/3d/implementation-status.md` for evidence and outstanding work.
