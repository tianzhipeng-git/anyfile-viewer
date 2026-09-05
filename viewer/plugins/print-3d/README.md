# Printing model viewer

Read-only 3MF build geometry/components/transforms/units and uncompressed AMF
triangle volumes. ZIP entries, actual decompressed bytes, XML and object recursion
are bounded. Rendering is delegated to `@anyfile/rendering-3d`.

3MF textures/per-face properties/required extensions and AMF constellations,
materials, curved triangles and compressed encoding remain unsupported. Does not
claim printability, repair, slicing, arrangement or export.

Run `pnpm --filter @anyfile/print-3d-viewer test`. Samples are in `examples/`.
