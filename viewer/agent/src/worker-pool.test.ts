// @vitest-environment node
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExtractWorkerPool } from "./worker-pool";

let pool: ExtractWorkerPool | undefined;
afterEach(async () => { await pool?.dispose(); });

describe("ExtractWorkerPool", () => {
  it("does not fail a retry on a fresh worker when the timed-out worker exits", async () => {
    const filePath = resolve(process.cwd(), "../plugins/plist/examples/app-config.binary.plist");
    const { size, mtimeMs } = statSync(filePath);
    const request = { op: "route" as const, filePath, size, mtimeMs };
    pool = new ExtractWorkerPool({ persistent: true });
    await expect(pool.call(request, { timeoutMs: 1 }))
      .rejects.toMatchObject({ code: "timeout" });
    await expect(pool.call(request, { timeoutMs: 15_000 }))
      .resolves.toMatchObject({ pluginId: "apple-plist", capabilities: ["read"] });
  }, 20_000);
});
