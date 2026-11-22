"use strict";

const SHELL_CACHE = "anyfile-shell-v1";
const RUNTIME_CACHE = "anyfile-runtime-v1";
const ACTIVE_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE]);

const VIEWER_SHELL_URLS = ["/en/view", "/zh-CN/view"];
const STATIC_SHELL_URLS = [
  "/brand/anyfile-192.png",
  "/brand/anyfile-512.png",
  "/brand/anyfile-64.png",
  "/en/manifest.webmanifest",
  "/zh-CN/manifest.webmanifest",
];

const VIEWER_ROUTE_RE = /^\/(?:en|zh-CN)\/view\/?$/;
const SHELL_ASSET_RE = /(?:src|href)=["'](\/_next\/static\/[^"'?#\s<>]+\.(?:js|css|woff2)(?:\?[^"'#\s<>]*)?)["']/g;

function isViewerRoute(pathname) {
  return VIEWER_ROUTE_RE.test(pathname);
}

function normalizeViewerPath(pathname) {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return trimmed === "/view" ? "/en/view" : trimmed;
}

function hasCrossOriginIsolationHeaders(response) {
  const coop = (response.headers.get("cross-origin-opener-policy") || "").trim().toLowerCase();
  const coep = (response.headers.get("cross-origin-embedder-policy") || "").trim().toLowerCase();
  return coop === "same-origin" && coep === "require-corp";
}

function isCacheableBasicResponse(response) {
  return Boolean(response && response.status === 200 && response.type === "basic" && !response.redirected);
}

function isCacheableCrossOriginRuntimeResponse(response) {
  if (!response || response.status !== 200 || response.type !== "cors" || response.redirected) {
    return false;
  }
  const corp = (response.headers.get("cross-origin-resource-policy") || "").trim().toLowerCase();
  return corp === "cross-origin";
}

function isSameOriginImmutableAsset(url) {
  return url.origin === self.location.origin
    && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/vendor/"));
}

function isSameOriginShellAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith("/brand/")
    || url.pathname.endsWith("/manifest.webmanifest")
    || url.pathname === "/manifest.webmanifest"
    || url.pathname === "/favicon.ico"
    || url.pathname === "/icon.png"
    || url.pathname === "/apple-icon.png"
  );
}

function isTrustedCrossOriginRuntimeAsset(url) {
  return (url.origin === "https://assets.anyfile.top" && url.pathname.startsWith("/vendor/"))
    || (url.origin === "https://cdn.jsdelivr.net" && url.pathname.startsWith("/npm/"));
}

function extractShellAssetUrls(html) {
  const discovered = new Set();
  for (const match of html.matchAll(SHELL_ASSET_RE)) {
    if (match[1]) discovered.add(match[1]);
  }
  return [...discovered];
}

async function warmImmutableAssets(assetUrls) {
  if (!assetUrls.length) return;
  const cache = await caches.open(RUNTIME_CACHE);
  await Promise.allSettled(assetUrls.map(async (assetUrl) => {
    const existing = await cache.match(assetUrl);
    if (existing) return;
    const response = await fetch(assetUrl, { credentials: "same-origin" });
    if (isCacheableBasicResponse(response)) {
      await cache.put(assetUrl, response);
    }
  }));
}

async function precacheAppShell() {
  const shellCache = await caches.open(SHELL_CACHE);
  const discoveredAssets = new Set();

  await Promise.allSettled(VIEWER_SHELL_URLS.map(async (viewerUrl) => {
    const response = await fetch(viewerUrl, { credentials: "same-origin" });
    if (!isCacheableBasicResponse(response) || !hasCrossOriginIsolationHeaders(response)) {
      return;
    }
    const html = await response.clone().text();
    for (const assetUrl of extractShellAssetUrls(html)) {
      discoveredAssets.add(assetUrl);
    }
    await shellCache.put(viewerUrl, response);
  }));

  await Promise.allSettled(STATIC_SHELL_URLS.map(async (assetUrl) => {
    const response = await fetch(assetUrl, { credentials: "same-origin" });
    if (isCacheableBasicResponse(response)) {
      await shellCache.put(assetUrl, response);
    }
  }));

  await warmImmutableAssets([...discoveredAssets]);
}

async function handleNavigation(request, url, event) {
  const normalizedPath = normalizeViewerPath(url.pathname);
  const viewerNavigation = isViewerRoute(normalizedPath);

  try {
    const response = await fetch(request);
    if (viewerNavigation && isCacheableBasicResponse(response) && hasCrossOriginIsolationHeaders(response)) {
      const cacheCopy = response.clone();
      const htmlCopy = response.clone();
      event.waitUntil((async () => {
        const shellCache = await caches.open(SHELL_CACHE);
        await shellCache.put(normalizedPath, cacheCopy);
        const html = await htmlCopy.text();
        await warmImmutableAssets(extractShellAssetUrls(html));
      })());
    }
    return response;
  } catch (error) {
    const shellCache = await caches.open(SHELL_CACHE);
    const cached = await shellCache.match(normalizedPath);
    if (cached) return cached;
    throw error;
  }
}

async function handleSameOriginImmutable(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableBasicResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function handleSameOriginShellAsset(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const networkUpdate = fetch(request).then(async (response) => {
    if (isCacheableBasicResponse(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  });

  if (cached) {
    event.waitUntil(networkUpdate.catch(() => undefined));
    return cached;
  }
  return networkUpdate;
}

async function handleCrossOriginRuntime(url) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cacheKey = url.href;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Always request trusted external runtimes in CORS mode without credentials so
  // cached responses are never opaque and remain compatible with COEP require-corp.
  const corsRequest = new Request(cacheKey, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
  });
  const response = await fetch(corsRequest);
  if (isCacheableCrossOriginRuntimeResponse(response)) {
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith("anyfile-") && !ACTIVE_CACHES.has(name))
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(handleNavigation(request, url, event));
    return;
  }

  if (isSameOriginImmutableAsset(url)) {
    event.respondWith(handleSameOriginImmutable(request));
    return;
  }

  if (isSameOriginShellAsset(url)) {
    event.respondWith(handleSameOriginShellAsset(request, event));
    return;
  }

  if (isTrustedCrossOriginRuntimeAsset(url)) {
    event.respondWith(handleCrossOriginRuntime(url));
  }
});
