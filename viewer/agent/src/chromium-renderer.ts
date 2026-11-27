import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentError, type AgentErrorCode } from "@anyfile/viewer-protocol";
import { launchHeadlessBrowser, type HeadlessBrowserHandle } from "./cdp-client";
import { normalizeMaxDimension, readPngDimensions } from "./png";
import { RenderAssetServer } from "./render-server";

export interface ChromiumRenderRequest {
  readonly pluginId: string;
  readonly filePath: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly workspaceRoot?: string;
  readonly target?: string;
  readonly maxDimension?: number;
  readonly timeoutMs?: number;
}

export interface ChromiumRenderResult {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly targetIgnored?: boolean;
}

export interface ChromiumRendererOptions {
  readonly persistent?: boolean;
  readonly idleTimeoutMs?: number;
  readonly rendererHostDir?: string;
}

interface HostOpenResult {
  readonly outcome: "success" | "failure";
  readonly hasCaptureImage?: boolean;
  readonly code?: string;
  readonly message?: string;
}

interface HostCaptureResult {
  readonly ok: boolean;
  readonly base64?: string;
  readonly code?: string;
  readonly message?: string;
}

function defaultRendererHostDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "renderer-host"),
    resolve(here, "../dist/renderer-host"),
    resolve(here, "../renderer-host"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html")) && existsSync(join(dir, "assets"))) return dir;
  }
  return candidates[1];
}

function mapHostErrorCode(code: string | undefined, message: string | undefined): AgentErrorCode {
  if (message && /webgl/i.test(message)) return "runtime-unavailable";
  switch (code) {
    case "invalid-file":
    case "missing-related-file":
    case "resource-limit":
    case "runtime-unavailable":
    case "target-not-found":
    case "encrypted-file":
    case "unsupported-capability":
    case "timeout":
      return code;
    case "unsupported-environment":
      return "runtime-unavailable";
    default:
      return "invalid-file";
  }
}

function isAllowedBrowserUrl(url: string, origin: string): boolean {
  return (
    url === "about:blank" ||
    url.startsWith(`${origin}/`) ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  );
}

/**
 * Manages a lazy headless Chromium instance + isolated `127.0.0.1` asset server for visual rendering.
 * In `persistent` (MCP) mode, reuses one browser process with per-request isolated contexts and idle shutdown.
 */
export class ChromiumRenderer {
  private readonly persistent: boolean;
  private readonly idleTimeoutMs: number;
  private readonly rendererHostDir: string;
  private server: RenderAssetServer | null = null;
  private browser: HeadlessBrowserHandle | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private activeRenders = 0;

  constructor(options: ChromiumRendererOptions = {}) {
    this.persistent = options.persistent ?? false;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 5 * 60 * 1000;
    this.rendererHostDir = options.rendererHostDir ?? defaultRendererHostDir();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleIdleShutdown(): void {
    this.clearIdleTimer();
    if (!this.persistent || this.activeRenders > 0) return;
    this.idleTimer = setTimeout(() => {
      void this.dispose();
    }, this.idleTimeoutMs);
    this.idleTimer.unref();
  }

  private async ensureRuntime(): Promise<{ readonly server: RenderAssetServer; readonly browser: HeadlessBrowserHandle }> {
    if (!existsSync(join(this.rendererHostDir, "index.html"))) {
      throw new AgentError(
        "runtime-unavailable",
        `Renderer host static assets not found at ${this.rendererHostDir}. Run @anyfile/agent build first.`,
      );
    }
    if (!this.server) {
      this.server = new RenderAssetServer({ rendererHostDir: this.rendererHostDir });
      await this.server.start();
    }
    if (!this.browser || !this.browser.isAlive()) {
      await this.browser?.close();
      this.browser = await launchHeadlessBrowser();
    }
    return { server: this.server, browser: this.browser };
  }

  async render(req: ChromiumRenderRequest): Promise<ChromiumRenderResult> {
    this.clearIdleTimer();
    this.activeRenders += 1;
    const maxDimension = normalizeMaxDimension(req.maxDimension);
    const timeoutMs = req.timeoutMs ?? 30_000;

    let grant: ReturnType<RenderAssetServer["registerSession"]> | undefined;
    let browserContextId: string | undefined;
    let targetId: string | undefined;
    let sessionId: string | undefined;
    let offFetch: (() => void) | undefined;
    let browser: HeadlessBrowserHandle | undefined;

    try {
      const runtime = await this.ensureRuntime();
      browser = runtime.browser;
      const { server } = runtime;
      const { cdp } = browser;

      grant = server.registerSession({
        filePath: req.filePath,
        workspaceRoot: req.workspaceRoot,
      });

      const ctxRes = await cdp.send<{ browserContextId: string }>("Target.createBrowserContext", {
        disposeOnDetach: true,
      });
      browserContextId = ctxRes.browserContextId;

      const targetRes = await cdp.send<{ targetId: string }>("Target.createTarget", {
        url: "about:blank",
        browserContextId,
      });
      targetId = targetRes.targetId;

      const attachRes = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      sessionId = attachRes.sessionId;

      await cdp.send("Page.enable", undefined, sessionId);
      await cdp.send("Runtime.enable", undefined, sessionId);
      await cdp.send("DOM.enable", undefined, sessionId);
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);

      // Strict network isolation: block everything except 127.0.0.1 server, data:, and blob:.
      offFetch = cdp.on("Fetch.requestPaused", (params, eventSessionId) => {
        if (eventSessionId !== sessionId) return;
        const requestId = String(params.requestId ?? "");
        const request = params.request as { url?: string } | undefined;
        const url = request?.url ?? "";
        if (isAllowedBrowserUrl(url, server.origin)) {
          void cdp.send("Fetch.continueRequest", { requestId }, sessionId).catch(() => undefined);
        } else {
          void cdp.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, sessionId).catch(() => undefined);
        }
      });

      const viewportWidth = Math.min(maxDimension, 1600);
      const viewportHeight = Math.min(maxDimension, 1200);
      await cdp.send(
        "Emulation.setDeviceMetricsOverride",
        { width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );

      const hostErrors: string[] = [];
      const offException = cdp.on("Runtime.exceptionThrown", (params, eventSessionId) => {
        if (eventSessionId !== sessionId) return;
        const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
        const desc = details?.exception?.description ?? details?.text;
        if (desc) hostErrors.push(desc);
      });

      const hostUrl = `${server.origin}/renderer-host/index.html`;
      let navigatedToHost = false;
      const loadDone = new Promise<void>((resolveLoad, rejectLoad) => {
        const timer = setTimeout(() => {
          offNav();
          offLoad();
          rejectLoad(new AgentError("timeout", "Timed out waiting for renderer-host to load."));
        }, timeoutMs);
        const offNav = cdp.on("Page.frameNavigated", (params, eventSessionId) => {
          if (eventSessionId !== sessionId) return;
          const frame = params.frame as { url?: string; parentId?: string } | undefined;
          if (!frame?.parentId && frame?.url?.startsWith(server.origin)) {
            navigatedToHost = true;
          }
        });
        const offLoad = cdp.on("Page.loadEventFired", (_params, eventSessionId) => {
          if (eventSessionId === sessionId && navigatedToHost) {
            clearTimeout(timer);
            offNav();
            offLoad();
            resolveLoad();
          }
        });
      });
      await cdp.send("Page.navigate", { url: hostUrl }, sessionId, timeoutMs);
      await loadDone;
      offException();

      const openPayload = {
        pluginId: req.pluginId,
        fileUrl: `${server.origin}${grant.filePathUrl}`,
        fileName: basename(req.filePath),
        fileSize: req.size,
        fileLastModified: Math.round(req.mtimeMs),
        ...(grant.workspaceBaseUrl ? { workspaceBaseUrl: `${server.origin}${grant.workspaceBaseUrl}` } : {}),
        ...(grant.workspaceListUrl ? { workspaceListUrl: `${server.origin}${grant.workspaceListUrl}` } : {}),
      };

      const openEval = await cdp.send<{
        result?: { value?: HostOpenResult };
        exceptionDetails?: { text?: string; exception?: { description?: string } };
      }>(
        "Runtime.evaluate",
        {
          expression: `window.__ANYFILE_RENDER_HOST__ ? window.__ANYFILE_RENDER_HOST__.open(${JSON.stringify(openPayload)}) : { outcome: "failure", code: "runtime-unavailable", message: ${JSON.stringify(hostErrors[0] || "Renderer host bridge did not initialize.")} }`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
        timeoutMs,
      );

      if (openEval.exceptionDetails) {
        const text =
          openEval.exceptionDetails.exception?.description ??
          openEval.exceptionDetails.text ??
          "Renderer host threw an exception.";
        throw new AgentError(mapHostErrorCode(undefined, text), text, { pluginId: req.pluginId });
      }
      const openResult = openEval.result?.value;
      if (!openResult || openResult.outcome !== "success") {
        throw new AgentError(
          mapHostErrorCode(openResult?.code, openResult?.message),
          openResult?.message ?? `Failed to render file with plugin "${req.pluginId}".`,
          { pluginId: req.pluginId },
        );
      }

      if (openResult.hasCaptureImage) {
        const captureEval = await cdp.send<{ result?: { value?: HostCaptureResult }; exceptionDetails?: { text?: string } }>(
          "Runtime.evaluate",
          {
            expression: `window.__ANYFILE_RENDER_HOST__.captureImage(${JSON.stringify({
              ...(req.target ? { target: req.target } : {}),
              maxDimension,
            })})`,
            awaitPromise: true,
            returnByValue: true,
          },
          sessionId,
          timeoutMs,
        );
        const cap = captureEval.result?.value;
        if (!cap?.ok || !cap.base64) {
          throw new AgentError(
            mapHostErrorCode(cap?.code, cap?.message),
            cap?.message ?? captureEval.exceptionDetails?.text ?? "captureImage() failed.",
            { pluginId: req.pluginId },
          );
        }
        const png = new Uint8Array(Buffer.from(cap.base64, "base64"));
        const { width, height } = readPngDimensions(png);
        return { png, width, height };
      }

      // Fallback: CDP element screenshot of #viewer-root.
      const doc = await cdp.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 2 }, sessionId);
      const queried = await cdp.send<{ nodeId: number }>(
        "DOM.querySelector",
        { nodeId: doc.root.nodeId, selector: "#viewer-root" },
        sessionId,
      );
      let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
      if (queried.nodeId) {
        const box = await cdp.send<{ model?: { content?: number[]; width?: number; height?: number } }>(
          "DOM.getBoxModel",
          { nodeId: queried.nodeId },
          sessionId,
        );
        const content = box.model?.content;
        const w = Math.max(1, Math.round(box.model?.width ?? viewportWidth));
        const h = Math.max(1, Math.round(box.model?.height ?? viewportHeight));
        const scale = Math.min(1, maxDimension / Math.max(w, h));
        if (content && content.length >= 2) {
          clip = { x: content[0], y: content[1], width: w, height: h, scale };
        }
      }

      const shot = await cdp.send<{ data: string }>(
        "Page.captureScreenshot",
        { format: "png", ...(clip ? { clip } : {}) },
        sessionId,
        timeoutMs,
      );
      const png = new Uint8Array(Buffer.from(shot.data, "base64"));
      const { width, height } = readPngDimensions(png);
      return {
        png,
        width,
        height,
        ...(req.target ? { targetIgnored: true } : {}),
      };
    } finally {
      offFetch?.();
      if (browser?.isAlive() && sessionId) {
        await browser.cdp
          .send("Runtime.evaluate", { expression: "window.__ANYFILE_RENDER_HOST__?.dispose?.()", awaitPromise: true }, sessionId, 3000)
          .catch(() => undefined);
      }
      if (browser?.isAlive() && targetId) {
        await browser.cdp.send("Target.closeTarget", { targetId }, undefined, 3000).catch(() => undefined);
      }
      if (browser?.isAlive() && browserContextId) {
        await browser.cdp.send("Target.disposeBrowserContext", { browserContextId }, undefined, 3000).catch(() => undefined);
      }
      grant?.revoke();
      this.activeRenders -= 1;
      if (!this.persistent) {
        await this.dispose();
      } else {
        this.scheduleIdleShutdown();
      }
    }
  }

  async dispose(): Promise<void> {
    this.clearIdleTimer();
    const browser = this.browser;
    const server = this.server;
    this.browser = null;
    this.server = null;
    await browser?.close();
    await server?.close();
  }
}
