// @vitest-environment node
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { IfcAPI } from "web-ifc";
import { parseIfc } from "./parse";

// Opt-in: IFC_TEST_FILE=/absolute/path/to/model.ifc pnpm --filter @anyfile/ifc-viewer test
it.skipIf(!process.env.IFC_TEST_FILE)("parses a local IFC model", async () => {
  const api = new IfcAPI(); await api.Init(); api.SetLogLevel(6);
  try {
    const data = parseIfc(api, readFileSync(process.env.IFC_TEST_FILE!));
    expect(data.elements.length).toBeGreaterThan(0);
    expect(data.geometries.every(item => item.vertices.length > 0)).toBe(true);
  } finally { api.Dispose(); }
}, 120000);
