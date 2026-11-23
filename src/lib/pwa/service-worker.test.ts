import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SW_PATH = join(process.cwd(), "public/sw.js");
const SW_SOURCE = readFileSync(SW_PATH, "utf8");
const ORIGIN = "https://www.anyfile.top";

type FakeResponseInit = {
  status?: number;
  type?: ResponseType;
  redirected?: boolean;
  headers?: Record<string, string>;
  body?: string;
};

class FakeResponse {
  readonly status: number;
  readonly type: ResponseType;
  readonly redirected: boolean;
  readonly headers: Headers;
  private readonly bodyText: string;

  constructor(init: FakeResponseInit = {}) {
    this.status = init.status ?? 200;
    this.type = init.type ?? "basic";
    this.redirected = init.redirected ?? false;
    this.headers = new Headers(init.headers);
    this.bodyText = init.body ?? "";
  }

  clone() {
    return new FakeResponse({
      status: this.status,
      type: this.type,
      redirected: this.redirected,
      headers: Object.fromEntries(this.headers.entries()),
      body: this.bodyText,
    });
  }

  async text() {
    return this.bodyText;
  }
}

class FakeRequest {
  readonly url: string;
  readonly method: string;
  readonly mode: RequestMode;
  readonly credentials: RequestCredentials;
  readonly cache: RequestCache;
  readonly headers: Headers;

  constructor(
    input: string | FakeRequest,
    init: {
      method?: string;
      mode?: RequestMode;
      credentials?: RequestCredentials;
      cache?: RequestCache;
      headers?: Record<string, string>;
    } = {},
  ) {
    const urlString = typeof input === "string" ? input : input.url;
    this.url = new URL(urlString, ORIGIN).href;
    this.method = (init.method ?? (typeof input === "string" ? "GET" : input.method)).toUpperCase();
    this.mode = init.mode ?? (typeof input === "string" ? "cors" : input.mode);
    this.credentials = init.credentials ?? "same-origin";
    this.cache = init.cache ?? "default";
    this.headers = new Headers(init.headers);
  }
}

class FakeCache {
  readonly store = new Map<string, FakeResponse>();

  private key(input: string | FakeRequest) {
    return new URL(typeof input === "string" ? input : input.url, ORIGIN).href;
  }

  async match(input: string | FakeRequest) {
    return this.store.get(this.key(input));
  }

  async put(input: string | FakeRequest, response: FakeResponse) {
    this.store.set(this.key(input), response);
  }

  async keys() {
    return [...this.store.keys()].map((href) => new FakeRequest(href));
  }

  async delete(input: string | FakeRequest) {
    return this.store.delete(this.key(input));
  }
}

class FakeCacheStorage {
  readonly buckets = new Map<string, FakeCache>();

  async open(name: string) {
    let bucket = this.buckets.get(name);
    if (!bucket) {
      bucket = new FakeCache();
      this.buckets.set(name, bucket);
    }
    return bucket;
  }

  async keys() {
    return [...this.buckets.keys()];
  }

  async delete(name: string) {
    return this.buckets.delete(name);
  }
}

function createServiceWorkerHarness(
  fetchImpl: (input: string | FakeRequest, init?: RequestInit) => Promise<FakeResponse>,
  swUrl = `${ORIGIN}/sw.js`,
) {
  const caches = new FakeCacheStorage();
  const listeners = new Map<string, (event: unknown) => void>();
  const skipWaiting = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const fetchSpy = vi.fn(fetchImpl);

  const selfObj = {
    location: new URL(swUrl),
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, listener);
    },
    skipWaiting,
    clients: { claim },
  };

  const context = vm.createContext({
    self: selfObj,
    caches,
    fetch: fetchSpy,
    Request: FakeRequest,
    Response: FakeResponse,
    Headers,
    URL,
    Promise,
    Set,
  });

  vm.runInContext(SW_SOURCE, context, { filename: SW_PATH });

  async function dispatchLifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
    });
    await Promise.all(waits);
  }

  async function dispatchFetch(request: FakeRequest) {
    let responded = false;
    let responsePromise: Promise<FakeResponse> | undefined;
    const waits: Promise<unknown>[] = [];
    listeners.get("fetch")?.({
      request,
      respondWith(promise: Promise<FakeResponse>) {
        responded = true;
        responsePromise = Promise.resolve(promise);
      },
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
    });
    if (!responded || !responsePromise) {
      return { handled: false as const };
    }
    const response = await responsePromise;
    await Promise.all(waits);
    return { handled: true as const, response };
  }

  return { caches, fetchSpy, skipWaiting, claim, dispatchLifecycle, dispatchFetch };
}

const ISOLATED_HEADERS = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "content-type": "text/html; charset=utf-8",
};

describe("service worker offline caching and isolation", () => {
  it("precaches isolated viewer shells, static shell assets and discovered initial Next.js chunks on install", async () => {
    const viewerHtml = `<!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="/_next/static/css/app.css?dpl=1" />
          <script src="/_next/static/chunks/main-abc.js"></script>
        </head>
        <body></body>
      </html>`;

    const harness = createServiceWorkerHarness(async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
      if (url.pathname === "/en/view" || url.pathname === "/zh-CN/view") {
        return new FakeResponse({ headers: ISOLATED_HEADERS, body: viewerHtml });
      }
      return new FakeResponse({ headers: { "content-type": "application/javascript" }, body: "ok" });
    });

    await harness.dispatchLifecycle("install");

    expect(harness.skipWaiting).toHaveBeenCalledTimes(1);
    const shell = await harness.caches.open("anyfile-shell-v1");
    const statics = await harness.caches.open("anyfile-next-static-dev");

    expect(shell.store.has(`${ORIGIN}/en/view`)).toBe(true);
    expect(shell.store.has(`${ORIGIN}/zh-CN/view`)).toBe(true);
    expect(shell.store.has(`${ORIGIN}/brand/anyfile-192.png`)).toBe(true);
    expect(shell.store.has(`${ORIGIN}/en/manifest.webmanifest`)).toBe(true);
    expect(statics.store.has(`${ORIGIN}/_next/static/css/app.css?dpl=1`)).toBe(true);
    expect(statics.store.has(`${ORIGIN}/_next/static/chunks/main-abc.js`)).toBe(true);
  });

  it("names the static cache after the build id from the registration URL and purges older builds on activate", async () => {
    const harness = createServiceWorkerHarness(
      async () => new FakeResponse({ headers: { "content-type": "application/javascript" }, body: "ok" }),
      `${ORIGIN}/sw.js?v=build-42`,
    );
    await harness.caches.open("anyfile-next-static-build-41");
    await harness.caches.open("anyfile-next-static-build-40");
    await harness.caches.open("anyfile-shell-v1");

    await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/_next/static/chunks/app.js`));
    expect((await harness.caches.open("anyfile-next-static-build-42")).store.has(`${ORIGIN}/_next/static/chunks/app.js`)).toBe(true);

    await harness.dispatchLifecycle("activate");

    expect(await harness.caches.keys()).toEqual(
      expect.arrayContaining(["anyfile-next-static-build-42", "anyfile-shell-v1"]),
    );
    expect(await harness.caches.keys()).not.toContain("anyfile-next-static-build-41");
    expect(await harness.caches.keys()).not.toContain("anyfile-next-static-build-40");
  });

  it("refuses to cache viewer shells that lack COOP/COEP headers or are redirected", async () => {
    const harness = createServiceWorkerHarness(async (input) => {
      const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
      if (url.pathname === "/en/view") {
        return new FakeResponse({ headers: { "content-type": "text/html" }, body: "unisolated" });
      }
      if (url.pathname === "/zh-CN/view") {
        return new FakeResponse({ headers: ISOLATED_HEADERS, redirected: true, body: "redirected" });
      }
      return new FakeResponse({ body: "ok" });
    });

    await harness.dispatchLifecycle("install");

    const shell = await harness.caches.open("anyfile-shell-v1");
    expect(shell.store.has(`${ORIGIN}/en/view`)).toBe(false);
    expect(shell.store.has(`${ORIGIN}/zh-CN/view`)).toBe(false);
  });

  it("removes obsolete anyfile-* caches on activate while leaving unrelated caches intact", async () => {
    const harness = createServiceWorkerHarness(async () => new FakeResponse());
    await harness.caches.open("anyfile-shell-v0");
    await harness.caches.open("anyfile-runtime-v0");
    await harness.caches.open("anyfile-shell-v1");
    await harness.caches.open("other-app-cache");

    await harness.dispatchLifecycle("activate");

    expect(await harness.caches.keys()).toEqual(["anyfile-shell-v1", "other-app-cache"]);
    expect(harness.claim).toHaveBeenCalledTimes(1);
  });

  it("serves cached isolated viewer shells offline including query-parameterized and /view routes", async () => {
    let online = true;
    const harness = createServiceWorkerHarness(async (input) => {
      if (!online) throw new TypeError("Failed to fetch");
      const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
      if (url.pathname === "/en/view") {
        return new FakeResponse({ headers: ISOLATED_HEADERS, body: "<html>viewer</html>" });
      }
      return new FakeResponse({ body: "ok" });
    });

    const onlineResult = await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/en/view?entry=%2Fen%2Fformats%2Fpdf`, { mode: "navigate" }));
    expect(onlineResult.handled).toBe(true);

    online = false;
    const offlineParameterized = await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/en/view?entry=%2Fen%2Fformats%2Fdwg`, { mode: "navigate" }));
    expect(offlineParameterized.handled).toBe(true);
    expect(offlineParameterized.response?.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(offlineParameterized.response?.headers.get("cross-origin-embedder-policy")).toBe("require-corp");

    const offlineLegacy = await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/view`, { mode: "navigate" }));
    expect(offlineLegacy.handled).toBe(true);
    expect(await offlineLegacy.response?.text()).toBe("<html>viewer</html>");
  });

  it("caches cross-origin trusted runtimes only in CORS mode with CORP cross-origin and rejects opaque responses", async () => {
    const r2Url = "https://assets.anyfile.top/vendor/libredwg/0.14-anyfile.1/dist/libredwg-web.wasm";
    const jsdelivrUrl = "https://cdn.jsdelivr.net/npm/web-ifc@0.0.77/web-ifc.wasm";
    const missingCorpUrl = "https://assets.anyfile.top/vendor/broken/1.0.0/module.wasm";
    const opaqueUrl = "https://cdn.jsdelivr.net/npm/opaque@1.0.0/mod.js";

    const harness = createServiceWorkerHarness(async (input) => {
      const request = input as FakeRequest;
      expect(request.mode).toBe("cors");
      expect(request.credentials).toBe("omit");

      if (request.url === r2Url || request.url === jsdelivrUrl) {
        return new FakeResponse({
          type: "cors",
          headers: {
            "cross-origin-resource-policy": "cross-origin",
            "access-control-allow-origin": "*",
          },
          body: "wasm-bytes",
        });
      }
      if (request.url === missingCorpUrl) {
        return new FakeResponse({ type: "cors", body: "no-corp" });
      }
      return new FakeResponse({ status: 0, type: "opaque" });
    });

    const firstR2 = await harness.dispatchFetch(new FakeRequest(r2Url, { mode: "no-cors" }));
    expect(firstR2.handled).toBe(true);
    expect(firstR2.response?.type).toBe("cors");

    await harness.dispatchFetch(new FakeRequest(jsdelivrUrl, { mode: "cors" }));
    await harness.dispatchFetch(new FakeRequest(missingCorpUrl, { mode: "cors" }));
    await harness.dispatchFetch(new FakeRequest(opaqueUrl, { mode: "cors" }));

    const runtime = await harness.caches.open("anyfile-runtime-v1");
    expect(runtime.store.has(r2Url)).toBe(true);
    expect(runtime.store.has(jsdelivrUrl)).toBe(true);
    expect(runtime.store.has(missingCorpUrl)).toBe(false);
    expect(runtime.store.has(opaqueUrl)).toBe(false);

    const callsBeforeHit = harness.fetchSpy.mock.calls.length;
    const cachedR2 = await harness.dispatchFetch(new FakeRequest(r2Url, { mode: "cors" }));
    expect(cachedR2.handled).toBe(true);
    expect(harness.fetchSpy.mock.calls.length).toBe(callsBeforeHit);
  });

  it("bypasses non-GET, Range requests, analytics and arbitrary remote public files", async () => {
    const harness = createServiceWorkerHarness(async () => new FakeResponse());

    expect((await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/api/feedback`, { method: "POST" }))).handled).toBe(false);
    expect((await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/vendor/pdfjs/1.0/doc.wasm`, { headers: { range: "bytes=0-1023" } }))).handled).toBe(false);
    expect((await harness.dispatchFetch(new FakeRequest("https://www.googletagmanager.com/gtag/js?id=G-123"))).handled).toBe(false);
    expect((await harness.dispatchFetch(new FakeRequest("https://files.example.com/private-report.pdf"))).handled).toBe(false);
  });

  it("does not cache non-200 responses for same-origin vendor assets", async () => {
    const harness = createServiceWorkerHarness(async () => new FakeResponse({ status: 206, body: "partial" }));
    const vendorUrl = `${ORIGIN}/vendor/libraw/1.6.0/libraw.wasm`;

    const result = await harness.dispatchFetch(new FakeRequest(vendorUrl));
    expect(result.handled).toBe(true);
    expect(result.response?.status).toBe(206);

    const runtime = await harness.caches.open("anyfile-runtime-v1");
    expect(runtime.store.has(vendorUrl)).toBe(false);
  });

  it("bypasses non-viewer same-origin navigations", async () => {
    const harness = createServiceWorkerHarness(async () => new FakeResponse({ body: "seo-page" }));

    expect((await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/en`, { mode: "navigate" }))).handled).toBe(false);
    expect((await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/en/formats/pdf`, { mode: "navigate" }))).handled).toBe(false);
    expect((await harness.dispatchFetch(new FakeRequest(`${ORIGIN}/zh-CN/privacy`, { mode: "navigate" }))).handled).toBe(false);
    expect(harness.fetchSpy).not.toHaveBeenCalled();
  });

  it("bounds the runtime cache with LRU eviction so the oldest entries are dropped past the cap", async () => {
    const harness = createServiceWorkerHarness(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      return new FakeResponse({ type: "cors", headers: { "cross-origin-resource-policy": "cross-origin" }, body: url });
    });

    const urls = Array.from({ length: 90 }, (_, i) =>
      `https://assets.anyfile.top/vendor/pkg/1.0.0/chunk-${i}.wasm`);

    for (const url of urls) {
      await harness.dispatchFetch(new FakeRequest(url, { mode: "cors" }));
    }

    const runtime = await harness.caches.open("anyfile-runtime-v1");
    expect(runtime.store.size).toBe(80);
    expect(runtime.store.has(urls[0])).toBe(false);
    expect(runtime.store.has(urls[9])).toBe(false);
    expect(runtime.store.has(urls[10])).toBe(true);
    expect(runtime.store.has(urls[89])).toBe(true);
  });

  it("returns live network responses even when cache writes throw QuotaExceededError", async () => {
    const r2Url = "https://assets.anyfile.top/vendor/libredwg/0.14-anyfile.1/dist/libredwg-web.wasm";
    const chunkUrl = `${ORIGIN}/_next/static/chunks/heavy.js`;
    const iconUrl = `${ORIGIN}/brand/anyfile-192.png`;
    const harness = createServiceWorkerHarness(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === r2Url) {
        return new FakeResponse({
          type: "cors",
          headers: { "cross-origin-resource-policy": "cross-origin" },
          body: "wasm-live",
        });
      }
      return new FakeResponse({ body: "live-ok" });
    });

    const quotaError = new DOMException("Storage quota exceeded", "QuotaExceededError");
    const runtime = await harness.caches.open("anyfile-runtime-v1");
    const shell = await harness.caches.open("anyfile-shell-v1");
    vi.spyOn(runtime, "put").mockRejectedValue(quotaError);
    vi.spyOn(shell, "put").mockRejectedValue(quotaError);

    const sameOrigin = await harness.dispatchFetch(new FakeRequest(chunkUrl));
    expect(sameOrigin.handled).toBe(true);
    expect(sameOrigin.response?.status).toBe(200);
    expect(await sameOrigin.response?.text()).toBe("live-ok");

    const crossOrigin = await harness.dispatchFetch(new FakeRequest(r2Url, { mode: "cors" }));
    expect(crossOrigin.handled).toBe(true);
    expect(crossOrigin.response?.status).toBe(200);
    expect(await crossOrigin.response?.text()).toBe("wasm-live");

    const shellAsset = await harness.dispatchFetch(new FakeRequest(iconUrl));
    expect(shellAsset.handled).toBe(true);
    expect(shellAsset.response?.status).toBe(200);
    expect(await shellAsset.response?.text()).toBe("live-ok");
  });
});
