import { describe, expect, it } from "vitest";
import { findViewerRegistrations } from "@anyfile/viewer-protocol";
import { loadPluginPolicies } from "../../../scripts/plugin-policies.mjs";
import { viewerRegistrations } from "../viewer-registrations";

describe("production viewer registry", () => {
  it("registers every plugin package and wires probes exactly when ./probe is exported", () => {
    const { plugins } = loadPluginPolicies(process.cwd());
    const registeredIds = viewerRegistrations.map(({ manifest }) => manifest.id);
    expect([...registeredIds].sort()).toEqual(Object.keys(plugins).sort());

    for (const registration of viewerRegistrations) {
      const policy = plugins[registration.manifest.id];
      const exportsProbe = Boolean(policy.packageJson.exports?.["./probe"]);
      expect(Boolean(registration.probe), registration.manifest.id).toBe(exportsProbe);
    }
  });

  it("keeps hex-viewer last as the catch-all fallback", () => {
    expect(viewerRegistrations.at(-1)?.manifest.id).toBe("hex-viewer");
    expect(findViewerRegistrations("unknown.binary", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["hex-viewer"]);
  });
});
