import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentError } from "@anyfile/viewer-protocol";
import { discoverBrowserExecutable } from "./browser-discovery";

interface PendingCommand {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export type CdpEventHandler = (params: Record<string, unknown>, sessionId?: string) => void;

/**
 * Minimal Chrome DevTools Protocol client over Node 24's native `WebSocket`.
 * Zero Playwright/Puppeteer runtime dependencies.
 */
export class CdpClient {
  private readonly ws: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly listeners = new Map<string, Set<CdpEventHandler>>();
  private closed = false;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      let msg: { id?: number; method?: string; params?: Record<string, unknown>; sessionId?: string; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (typeof msg.id === "number") {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) {
          entry.reject(new Error(msg.error.message ?? "CDP command failed"));
        } else {
          entry.resolve(msg.result ?? {});
        }
        return;
      }
      if (typeof msg.method === "string") {
        const handlers = this.listeners.get(msg.method);
        if (!handlers) return;
        for (const handler of handlers) {
          handler(msg.params ?? {}, msg.sessionId);
        }
      }
    });

    ws.addEventListener("close", () => {
      this.closed = true;
      this.failAll(new AgentError("runtime-unavailable", "Chromium CDP connection closed unexpectedly."));
    });
  }

  static connect(wsUrl: string, timeoutMs = 15_000): Promise<CdpClient> {
    if (typeof globalThis.WebSocket !== "function") {
      return Promise.reject(new AgentError("runtime-unavailable", "Node native WebSocket is unavailable (requires Node 24+)."));
    }
    return new Promise<CdpClient>((resolveConnect, rejectConnect) => {
      const ws = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        rejectConnect(new AgentError("timeout", "Timed out connecting to Chromium CDP WebSocket."));
      }, timeoutMs);

      ws.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolveConnect(new CdpClient(ws));
        },
        { once: true },
      );
      ws.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          rejectConnect(new AgentError("runtime-unavailable", "Failed to connect to Chromium CDP WebSocket."));
        },
        { once: true },
      );
    });
  }

  get isOpen(): boolean {
    return !this.closed && this.ws.readyState === WebSocket.OPEN;
  }

  on(method: string, handler: CdpEventHandler): () => void {
    let set = this.listeners.get(method);
    if (!set) {
      set = new Set();
      this.listeners.set(method, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  send<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    timeoutMs = 20_000,
  ): Promise<T> {
    if (!this.isOpen) {
      return Promise.reject(new AgentError("runtime-unavailable", "Chromium CDP connection is closed."));
    }
    const id = this.nextId++;
    return new Promise<T>((resolveCmd, rejectCmd) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectCmd(new AgentError("timeout", `CDP command ${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolveCmd as (value: unknown) => void,
        reject: rejectCmd,
        timer,
      });
      const payload: Record<string, unknown> = { id, method };
      if (params) payload.params = params;
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }

  close(): void {
    this.closed = true;
    this.failAll(new AgentError("runtime-unavailable", "CDP client closed."));
    try {
      this.ws.close();
    } catch {
      // Ignore close errors.
    }
  }

  private failAll(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }
}

export interface HeadlessBrowserHandle {
  readonly cdp: CdpClient;
  readonly isAlive: () => boolean;
  close(): Promise<void>;
}

/** Launches a headless Chromium process with a temporary profile and returns a connected CDP client. */
export async function launchHeadlessBrowser(timeoutMs = 15_000): Promise<HeadlessBrowserHandle> {
  const executable = discoverBrowserExecutable();
  const profileDir = await mkdtemp(join(tmpdir(), "anyfile-chrome-profile-"));

  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-translate",
    "--metrics-recording-only",
    "--mute-audio",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1600,1200",
    "about:blank",
  ];

  const child: ChildProcess = spawn(executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
  });

  const cleanupProfile = async () => {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  };

  let wsUrl: string;
  try {
    wsUrl = await new Promise<string>((resolveUrl, rejectUrl) => {
      let stderrBuf = "";
      const timer = setTimeout(() => {
        rejectUrl(new AgentError("timeout", "Timed out waiting for Chromium DevTools endpoint."));
      }, timeoutMs);

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderrBuf += chunk;
        const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/\S+)/.exec(stderrBuf);
        if (match) {
          clearTimeout(timer);
          resolveUrl(match[1]);
        }
      });

      child.once("error", (err) => {
        clearTimeout(timer);
        rejectUrl(new AgentError("runtime-unavailable", `Failed to launch browser: ${err.message}`));
      });

      child.once("exit", (code) => {
        clearTimeout(timer);
        rejectUrl(
          new AgentError(
            "runtime-unavailable",
            `Browser exited before DevTools became ready (code ${String(code)}).`,
          ),
        );
      });
    });
  } catch (error) {
    child.kill("SIGKILL");
    await cleanupProfile();
    throw error;
  }

  let cdp: CdpClient;
  try {
    cdp = await CdpClient.connect(wsUrl, timeoutMs);
  } catch (error) {
    child.kill("SIGKILL");
    await cleanupProfile();
    throw error;
  }

  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  return {
    cdp,
    isAlive: () => !exited && cdp.isOpen,
    async close() {
      cdp.close();
      if (!exited) {
        child.kill("SIGTERM");
        await new Promise<void>((resolveExit) => {
          const killTimer = setTimeout(() => {
            if (!exited) child.kill("SIGKILL");
            resolveExit();
          }, 2000);
          child.once("exit", () => {
            clearTimeout(killTimer);
            resolveExit();
          });
        });
      }
      await cleanupProfile();
    },
  };
}
