# Point cloud representative preview

ASCII PCD/XYZ and LAS coordinates stream in a terminable Worker. LAZ uses a separately loaded, source-built laz-perf Worker runtime with a 256 MiB heap cap and 64 MiB compressed-input cap. PCD/XYZ/LAS input is capped at 2 GiB. At most 200,000 deterministic reservoir points remain resident; survey coordinates are rebased before Float32 conversion.

This is level 2 representative sampling. Color, intensity, classification, binary PCD, E57 and complete spatial LOD are not implemented. First output occurs while decoding; LAZ first reads its compressed input. Generated LAS/PCD/XYZ examples are in examples/. Run `pnpm --filter @anyfile/point-cloud-viewer test`.
