// @vitest-environment node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { AgentService } from "./agent-core";
import { readPngDimensions } from "./png";

const AGENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(AGENT_ROOT, "../..");
const RUN_CHROMIUM = process.env.ANYFILE_CHROMIUM_TEST === "1";

const OFD_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/ofd/examples/invoice-sample.ofd");
const CAD2D_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/cad-2d/examples/sample.dxf");
const IFC_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/ifc/fixtures/room.ifc");
const PLIST_SAMPLE = resolve(REPO_ROOT, "viewer/plugins/plist/examples/app-config.binary.plist");

describe.runIf(RUN_CHROMIUM)("Chromium CDP visual rendering integration", { timeout: 90_000 }, () => {
  const service = new AgentService({
    allowedRoots: [resolve(REPO_ROOT, "viewer/plugins")],
    persistent: true,
  });

  afterAll(async () => {
    await service.dispose();
  });

  it("renders OFD via controller.captureImage()", async () => {
    const res = await service.renderFile(OFD_SAMPLE, { target: "page:1", maxDimension: 800 });
    expect(res.pluginId).toBe("ofd-reader");
    expect(res.engine).toBe("chromium");
    const dims = readPngDimensions(res.png);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
    expect(Math.max(dims.width, dims.height)).toBeLessThanOrEqual(800);
  });

  it("renders CAD-2D via controller.captureImage()", async () => {
    const res = await service.renderFile(CAD2D_SAMPLE, { target: "fit", maxDimension: 800 });
    expect(res.pluginId).toBe("cad-2d");
    expect(res.engine).toBe("chromium");
    const dims = readPngDimensions(res.png);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
    expect(Math.max(dims.width, dims.height)).toBeLessThanOrEqual(800);
  });

  it("renders 3D models off-screen via the shared rendering-3d captureImage()", async () => {
    const res = await service.renderFile(IFC_SAMPLE, { target: "front", maxDimension: 256 });
    expect(res.pluginId).toBe("ifc");
    expect(res.targetIgnored).toBeUndefined();
    expect(readPngDimensions(res.png)).toEqual({ width: 256, height: 256 });
    await expect(service.renderFile(IFC_SAMPLE, { target: "bogus", maxDimension: 256 })).rejects.toMatchObject({ code: "target-not-found" });
  });

  it("falls back to CDP element screenshot for plugins without captureImage and marks targetIgnored", async () => {
    const res = await service.renderFile(PLIST_SAMPLE, { target: "custom-target", maxDimension: 800 });
    expect(res.pluginId).toBe("apple-plist");
    expect(res.engine).toBe("chromium");
    expect(res.targetIgnored).toBe(true);
    const dims = readPngDimensions(res.png);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });
});
