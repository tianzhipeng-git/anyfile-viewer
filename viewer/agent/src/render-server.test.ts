// @vitest-environment node
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RenderAssetServer } from "./render-server";

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("RenderAssetServer (127.0.0.1 isolated server)", () => {
  let tempDir = "";
  let hostDir = "";
  let workDir = "";
  let outsideDir = "";
  let cacheDir = "";
  let upstreamServer: Server | null = null;
  let upstreamUrl = "";
  let server: RenderAssetServer | null = null;

  const remotePayload = "console.log('remote-vendor-ok');\n";
  const remoteSha = sha256(remotePayload);
  const tamperedRemotePayload = "console.log('tampered');\n";

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "anyfile-render-srv-"));
    hostDir = join(tempDir, "renderer-host");
    workDir = join(tempDir, "work");
    outsideDir = join(tempDir, "outside");
    cacheDir = join(tempDir, "cache");

    await mkdir(hostDir, { recursive: true });
    await mkdir(workDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await mkdir(join(cacheDir, "vendor", "localpkg", "1.0.0"), { recursive: true });

    await writeFile(join(hostDir, "index.html"), "<!doctype html><html><body>host</body></html>", "utf8");
    await writeFile(join(workDir, "sample.bin"), "0123456789ABCDEF", "utf8");
    await writeFile(join(workDir, "sibling.txt"), "sibling-data", "utf8");
    await writeFile(join(outsideDir, "secret.txt"), "top-secret", "utf8");
    await symlink(join(outsideDir, "secret.txt"), join(workDir, "escape.txt"));

    await writeFile(join(cacheDir, "vendor", "localpkg", "1.0.0", "good.js"), "export const ok = 1;", "utf8");
    await writeFile(join(cacheDir, "vendor", "localpkg", "1.0.0", "bad.js"), "corrupted", "utf8");

    upstreamServer = createServer((req, res) => {
      if (req.url === "/vendor/remotepkg/2.0.0/mod.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(remotePayload);
        return;
      }
      if (req.url === "/vendor/remotepkg/2.0.0/tampered.js") {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(tamperedRemotePayload);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
    await new Promise<void>((resolve) => upstreamServer!.listen(0, "127.0.0.1", resolve));
    const addr = upstreamServer.address();
    if (!addr || typeof addr === "string") throw new Error("Failed to bind upstream test server");
    upstreamUrl = `http://127.0.0.1:${addr.port}/vendor`;

    server = new RenderAssetServer({
      rendererHostDir: hostDir,
      vendorRoots: [join(cacheDir, "vendor")],
      vendorCacheRoot: join(cacheDir, "vendor"),
      vendorUpstreamBaseUrl: upstreamUrl,
      vendorManifest: {
        "localpkg/1.0.0/good.js": sha256("export const ok = 1;"),
        "localpkg/1.0.0/bad.js": sha256("expected-different-content"),
        "remotepkg/2.0.0/mod.js": remoteSha,
        "remotepkg/2.0.0/tampered.js": sha256("expected-good-remote"),
      },
    });
    await server.start();
  });

  afterAll(async () => {
    await server?.close();
    if (upstreamServer) {
      await new Promise<void>((resolve) => upstreamServer!.close(() => resolve()));
    }
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("binds to 127.0.0.1 and sets COOP/COEP headers on static renderer-host assets", async () => {
    expect(server!.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const res = await fetch(`${server!.origin}/renderer-host/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(res.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    expect(await res.text()).toContain("host");
  });

  it("serves read-only Range requests for registered tokens and rejects invalid methods/tokens", async () => {
    const grant = server!.registerSession({
      filePath: join(workDir, "sample.bin"),
      workspaceRoot: workDir,
    });
    try {
      const full = await fetch(`${server!.origin}${grant.filePathUrl}`);
      expect(full.status).toBe(200);
      expect(full.headers.get("accept-ranges")).toBe("bytes");
      expect(await full.text()).toBe("0123456789ABCDEF");

      const partial = await fetch(`${server!.origin}${grant.filePathUrl}`, {
        headers: { Range: "bytes=4-9" },
      });
      expect(partial.status).toBe(206);
      expect(partial.headers.get("content-range")).toBe("bytes 4-9/16");
      expect(await partial.text()).toBe("456789");

      const badRange = await fetch(`${server!.origin}${grant.filePathUrl}`, {
        headers: { Range: "bytes=100-200" },
      });
      expect(badRange.status).toBe(416);

      const postRes = await fetch(`${server!.origin}${grant.filePathUrl}`, { method: "POST", body: "x" });
      expect(postRes.status).toBe(405);

      // Workspace sibling access works, symlink escape is blocked.
      const sib = await fetch(`${server!.origin}${grant.workspaceBaseUrl}/sibling.txt`);
      expect(sib.status).toBe(200);
      expect(await sib.text()).toBe("sibling-data");

      const escape = await fetch(`${server!.origin}${grant.workspaceBaseUrl}/escape.txt`);
      expect(escape.status).toBe(404);
    } finally {
      grant.revoke();
    }

    const revoked = await fetch(`${server!.origin}${grant.filePathUrl}`);
    expect(revoked.status).toBe(404);
  });

  it("verifies local /vendor/ SHA-256 and transparently caches verified upstream downloads", async () => {
    const good = await fetch(`${server!.origin}/vendor/localpkg/1.0.0/good.js`);
    expect(good.status).toBe(200);
    expect(await good.text()).toBe("export const ok = 1;");

    const bad = await fetch(`${server!.origin}/vendor/localpkg/1.0.0/bad.js`);
    expect(bad.status).toBe(502);

    const remote = await fetch(`${server!.origin}/vendor/remotepkg/2.0.0/mod.js`);
    expect(remote.status).toBe(200);
    expect(await remote.text()).toBe(remotePayload);
    const cachedOnDisk = await readFile(join(cacheDir, "vendor", "remotepkg", "2.0.0", "mod.js"), "utf8");
    expect(cachedOnDisk).toBe(remotePayload);

    const tampered = await fetch(`${server!.origin}/vendor/remotepkg/2.0.0/tampered.js`);
    expect(tampered.status).toBe(502);
  });
});
