"use client";

import { useEffect } from "react";

export function PwaLifecycle() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !window.isSecureContext) return;
    if (!("serviceWorker" in navigator)) return;

    const buildId = process.env.NEXT_PUBLIC_ANYFILE_BUILD_ID;
    const swUrl = buildId ? `/sw.js?v=${encodeURIComponent(buildId)}` : "/sw.js";
    void navigator.serviceWorker.register(swUrl, { scope: "/" }).catch(() => undefined);
  }, []);

  return null;
}
