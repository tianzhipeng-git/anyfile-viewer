# CAD exchange viewer

Local STEP/STP, IGES/IGS and BREP tessellation through a source-built OCCT Worker. Input 16 MiB, kernel heap 256 MiB, output 1M vertices / 500k triangles. Faces, boundaries, assembly names and colors feed the shared 3D runtime. STEP/IGES are normalized to mm; BREP units are unknown.

Every import creates and terminates its own Worker. See `docs/3d/dependency-audit.md` for the known upstream malformed-input advisory and remaining limits. This is tessellated viewing, not exact CAD editing, PMI or validation. `tools/occt-import-build/` contains the complete source build recipe; ordinary application builds only verify/copy reviewed assets.
