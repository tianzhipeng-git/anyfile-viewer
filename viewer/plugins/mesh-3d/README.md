# Mesh and CG viewer

Local STL, OBJ/MTL, PLY, OFF and glTF 2.0/GLB adapters, independently lazy-loaded.
Uses the shared `@anyfile/rendering-3d` viewport. Input is capped at 64 MiB.
STL parsing runs in a terminable Worker. Other loaders currently parse bounded
whole inputs. Related resources must resolve through the authorized workspace;
no file-provided remote URL is fetched. Only PNG/JPEG textures are accepted.

Advanced compression, some material options, colored OFF, and arbitrary external
buffer-view images are not configured. OFF polygons currently assume convexity.
Animation controls appear only when a glTF scene has clips; dedicated animated
fixture verification remains pending. No editing, repair or format conversion.

Run `pnpm --filter @anyfile/mesh-3d-viewer test`. Fixed samples and generation script
are in `examples/`. See `docs/3d/implementation-status.md` for the exact scope.
