import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findViewerRegistrations, resolveViewerRegistrations } from "@anyfile/viewer-protocol";
import { viewerRegistrations } from "../viewer-registrations";

describe("CAD and 3D routing", () => {
  it("routes IFC building models before Hex and rejects unrelated STEP text", async () => {
    const bytes = readFileSync(join(process.cwd(), "viewer/plugins/ifc/fixtures/room.ifc"));
    const result = await resolveViewerRegistrations(new File([bytes], "room.IFC"), viewerRegistrations, { signal: new AbortController().signal });
    expect(result.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel])).toEqual([["ifc", 3], ["hex-viewer", 1]]);
    const invalid = await resolveViewerRegistrations(new File(["ISO-10303-21; FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));"], "bad.ifc"), viewerRegistrations, { signal: new AbortController().signal });
    expect(invalid.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);
  });

  it.each(["room-ascii.fbx", "room-binary.fbx", "room.dae"])("routes %s to the scene viewer", async (name) => {
    const bytes = readFileSync(join(process.cwd(), "viewer/plugins/mesh-3d/fixtures/scenes", name));
    const result = await resolveViewerRegistrations(new File([bytes], name.toUpperCase()), viewerRegistrations, { signal: new AbortController().signal });
    expect(result.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel])).toEqual([["mesh-3d", 3], ["hex-viewer", 1]]);
  });

  it("routes Wavefront OBJ text to mesh-3d despite sharing .obj with COFF object files", async () => {
    const wavefrontObj = await resolveViewerRegistrations(
      new File(["v 0 0 0\nv 1 0 0\nf 1 2 1\n"], "mesh.obj"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(wavefrontObj.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["mesh-3d", 3], ["hex-viewer", 1]]);
  });

  it("orders CAD and 3D candidates consistently", () => {
    expect(findViewerRegistrations("drawing.dxf", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["cad-2d", "hex-viewer"]);
    expect(findViewerRegistrations("mesh.obj", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["dev-native-binary-viewer", "mesh-3d", "hex-viewer"]);
  });
});
