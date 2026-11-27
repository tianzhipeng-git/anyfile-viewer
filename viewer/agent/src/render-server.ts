import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { assertVendorPath, defaultVendorRoots, getVendorCacheRoot, sha256Hex } from "@anyfile/runtime-assets/node";
import { createDiskWorkspaceReader } from "./security";
import { loadDefaultVendorManifest } from "./vendor-manifest";

export const DEFAULT_VENDOR_UPSTREAM_URL = "https://assets.anyfile.top/vendor";

export interface RenderServerOptions {
  readonly rendererHostDir: string;
  readonly vendorRoots?: readonly string[];
  readonly vendorCacheRoot?: string;
  readonly vendorManifest?: Readonly<Record<string, string>>;
  readonly vendorUpstreamBaseUrl?: string;
}

export interface SessionGrant {
  readonly token: string;
  readonly filePathUrl: string;
  readonly workspaceBaseUrl?: string;
  readonly workspaceListUrl?: string;
  revoke(): void;
}

interface ActiveSession {
  readonly filePath: string;
  readonly workspaceRoot?: string;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".data": "application/octet-stream",
  ".mem": "application/octet-stream",
  ".map": "application/json; charset=utf-8",
};

function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function setIsolationHeaders(res: ServerResponse): void {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
}

function parseByteRange(header: string, totalSize: number): { start: number; end: number } | "invalid" {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return "invalid";
  if (totalSize === 0) return "invalid";

  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) return "invalid";
    const start = Math.max(0, totalSize - suffix);
    return { start, end: totalSize - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Math.min(Number(rawEnd), totalSize - 1) : totalSize - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= totalSize || end < start) {
    return "invalid";
  }
  return { start, end };
}

function isWithinDir(target: string, root: string): boolean {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return target === root || target.startsWith(prefix);
}

/**
 * Isolated `127.0.0.1` HTTP server for the headless Chromium `renderer-host`:
 * - Enforces COOP/COEP headers on every response.
 * - Exposes target file & authorized workspace files via random session tokens with read-only Range support.
 * - Serves `/vendor/<pkg>/<version>/*` from local cache/roots with SHA-256 verification and transparent upstream fetch.
 */
export class RenderAssetServer {
  private readonly rendererHostDir: string;
  private readonly vendorRoots: readonly string[];
  private readonly vendorCacheRoot: string;
  private readonly vendorManifest: Readonly<Record<string, string>>;
  private readonly vendorUpstreamBaseUrl: string;
  private readonly sessions = new Map<string, ActiveSession>();
  private readonly inflightDownloads = new Map<string, Promise<Uint8Array>>();
  private server: Server | null = null;
  private boundOrigin = "";

  constructor(options: RenderServerOptions) {
    this.rendererHostDir = resolve(options.rendererHostDir);
    this.vendorRoots = options.vendorRoots ?? defaultVendorRoots();
    this.vendorCacheRoot = options.vendorCacheRoot ?? getVendorCacheRoot();
    this.vendorManifest = options.vendorManifest ?? loadDefaultVendorManifest();
    this.vendorUpstreamBaseUrl = (options.vendorUpstreamBaseUrl ?? DEFAULT_VENDOR_UPSTREAM_URL).replace(/\/+$/, "");
  }

  get origin(): string {
    return this.boundOrigin;
  }

  async start(): Promise<string> {
    if (this.server) return this.boundOrigin;
    const server = createServer((req, res) => {
      void this.handleRequest(req, res).catch(() => {
        if (!res.headersSent) {
          setIsolationHeaders(res);
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        }
        res.end("Internal server error");
      });
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", rejectListen);
        resolveListen();
      });
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      throw new Error("Failed to bind RenderAssetServer on 127.0.0.1.");
    }
    this.server = server;
    this.boundOrigin = `http://127.0.0.1:${addr.port}`;
    return this.boundOrigin;
  }

  registerSession(session: ActiveSession): SessionGrant {
    const token = randomBytes(24).toString("hex");
    this.sessions.set(token, session);
    return {
      token,
      filePathUrl: `/file/${token}`,
      ...(session.workspaceRoot
        ? {
            workspaceBaseUrl: `/workspace/${token}/file`,
            workspaceListUrl: `/workspace/${token}/list`,
          }
        : {}),
      revoke: () => {
        this.sessions.delete(token);
      },
    };
  }

  async close(): Promise<void> {
    this.sessions.clear();
    const server = this.server;
    this.server = null;
    this.boundOrigin = "";
    if (!server) return;
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    setIsolationHeaders(res);
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }

    const parsed = new URL(req.url ?? "/", this.boundOrigin || "http://127.0.0.1");
    const pathname = parsed.pathname;

    if (pathname === "/renderer-host" || pathname.startsWith("/renderer-host/")) {
      await this.serveRendererHost(pathname, method, res);
      return;
    }

    if (pathname.startsWith("/file/")) {
      const token = pathname.slice("/file/".length);
      const session = this.sessions.get(token);
      if (!session) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      await this.serveDiskFileWithRange(session.filePath, req, res, method);
      return;
    }

    if (pathname.startsWith("/workspace/")) {
      await this.serveWorkspace(pathname, parsed.searchParams, req, res, method);
      return;
    }

    if (pathname.startsWith("/vendor/")) {
      const vendorPath = decodeURIComponent(pathname.slice("/vendor/".length));
      await this.serveVendorAsset(vendorPath, method, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  private async serveRendererHost(pathname: string, method: string, res: ServerResponse): Promise<void> {
    let rel = pathname.slice("/renderer-host".length).replace(/^\/+/, "");
    if (!rel) rel = "index.html";
    let decoded: string;
    try {
      decoded = decodeURIComponent(rel);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    if (decoded.includes("\0") || decoded.split("/").includes("..")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const candidate = resolve(this.rendererHostDir, decoded);
    if (!isWithinDir(candidate, this.rendererHostDir) || !existsSync(candidate)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const realRoot = await realpath(this.rendererHostDir);
    const realCandidate = await realpath(candidate);
    if (!isWithinDir(realCandidate, realRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const info = await stat(realCandidate);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": mimeTypeFor(realCandidate),
      "content-length": String(info.size),
    });
    if (method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(realCandidate).pipe(res);
  }

  private async serveDiskFileWithRange(
    filePath: string,
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
  ): Promise<void> {
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const totalSize = info.size;
    const rangeHeader = req.headers.range;
    if (typeof rangeHeader === "string") {
      const parsedRange = parseByteRange(rangeHeader, totalSize);
      if (parsedRange === "invalid") {
        res.writeHead(416, { "content-range": `bytes */${totalSize}` });
        res.end();
        return;
      }
      const { start, end } = parsedRange;
      res.writeHead(206, {
        "content-type": "application/octet-stream",
        "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${totalSize}`,
        "content-length": String(end - start + 1),
      });
      if (method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "accept-ranges": "bytes",
      "content-length": String(totalSize),
    });
    if (method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  }

  private async serveWorkspace(
    pathname: string,
    searchParams: URLSearchParams,
    req: IncomingMessage,
    res: ServerResponse,
    method: string,
  ): Promise<void> {
    const rest = pathname.slice("/workspace/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const token = rest.slice(0, slash);
    const sub = rest.slice(slash + 1);
    const session = this.sessions.get(token);
    if (!session?.workspaceRoot) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    if (sub === "list") {
      const dir = searchParams.get("dir") ?? "";
      const reader = createDiskWorkspaceReader(session.workspaceRoot);
      const entries = [];
      for await (const entry of reader.list(dir)) {
        entries.push(entry);
      }
      const body = Buffer.from(JSON.stringify(entries), "utf8");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-length": String(body.byteLength) });
      res.end(method === "HEAD" ? undefined : body);
      return;
    }

    if (sub.startsWith("file/")) {
      let relPath: string;
      try {
        relPath = decodeURIComponent(sub.slice("file/".length));
      } catch {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }
      const reader = createDiskWorkspaceReader(session.workspaceRoot);
      const file = await reader.open(relPath);
      if (!file) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rangeHeader = req.headers.range;
      if (typeof rangeHeader === "string") {
        const parsedRange = parseByteRange(rangeHeader, bytes.byteLength);
        if (parsedRange === "invalid") {
          res.writeHead(416, { "content-range": `bytes */${bytes.byteLength}` });
          res.end();
          return;
        }
        const slice = bytes.subarray(parsedRange.start, parsedRange.end + 1);
        res.writeHead(206, {
          "content-type": "application/octet-stream",
          "accept-ranges": "bytes",
          "content-range": `bytes ${parsedRange.start}-${parsedRange.end}/${bytes.byteLength}`,
          "content-length": String(slice.byteLength),
        });
        res.end(method === "HEAD" ? undefined : slice);
        return;
      }
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "accept-ranges": "bytes",
        "content-length": String(bytes.byteLength),
      });
      res.end(method === "HEAD" ? undefined : bytes);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  private async serveVendorAsset(vendorPath: string, method: string, res: ServerResponse): Promise<void> {
    let segments: string[];
    try {
      segments = assertVendorPath(vendorPath);
    } catch {
      res.writeHead(400);
      res.end("Invalid vendor asset path");
      return;
    }

    const expectedSha = this.vendorManifest[vendorPath]?.toLowerCase();
    let localFile: string | null = null;
    for (const root of this.vendorRoots) {
      const candidate = join(root, ...segments);
      try {
        if (statSync(candidate).isFile()) {
          localFile = candidate;
          break;
        }
      } catch {
        // Not present under this root.
      }
    }

    if (localFile) {
      const bytes = new Uint8Array(await readFile(localFile));
      if (expectedSha && sha256Hex(bytes) !== expectedSha) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end(`SHA-256 mismatch for /vendor/${vendorPath}`);
        return;
      }
      res.writeHead(200, {
        "content-type": mimeTypeFor(localFile),
        "content-length": String(bytes.byteLength),
      });
      res.end(method === "HEAD" ? undefined : bytes);
      return;
    }

    if (!expectedSha || !this.vendorUpstreamBaseUrl) {
      res.writeHead(404);
      res.end("Vendor asset not found");
      return;
    }

    try {
      const bytes = await this.fetchAndCacheVendorAsset(vendorPath, segments, expectedSha);
      res.writeHead(200, {
        "content-type": mimeTypeFor(vendorPath),
        "content-length": String(bytes.byteLength),
      });
      res.end(method === "HEAD" ? undefined : bytes);
    } catch (error) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : "Failed to fetch vendor asset");
    }
  }

  private fetchAndCacheVendorAsset(
    vendorPath: string,
    segments: readonly string[],
    expectedSha: string,
  ): Promise<Uint8Array> {
    const existing = this.inflightDownloads.get(vendorPath);
    if (existing) return existing;

    const promise = (async () => {
      const upstreamUrl = `${this.vendorUpstreamBaseUrl}/${vendorPath}`;
      const response = await fetch(upstreamUrl);
      if (!response.ok) {
        throw new Error(`Upstream vendor fetch failed (${response.status}) for ${vendorPath}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (sha256Hex(bytes) !== expectedSha) {
        throw new Error(`SHA-256 verification failed for downloaded /vendor/${vendorPath}`);
      }
      const dest = join(this.vendorCacheRoot, ...segments);
      await mkdir(dirname(dest), { recursive: true });
      const tmp = `${dest}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(tmp, bytes);
      await rename(tmp, dest);
      return bytes;
    })().finally(() => {
      this.inflightDownloads.delete(vendorPath);
    });

    this.inflightDownloads.set(vendorPath, promise);
    return promise;
  }
}
