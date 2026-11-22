"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PublishedLocale } from "@/i18n/config";
import { analyticsEnabled, CONSENT_CHANGE_EVENT, consentGranted, currentEntry, GA_ID, initializeAnalytics, safePath, setAnalyticsConsent, taskEntry, track, updateAnalyticsConsent } from "@/lib/analytics/events";

export function AnalyticsOptOut({ locale }: { locale: PublishedLocale }) {
  const [enabled, setEnabled] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const zh = locale === "zh-CN";

  useEffect(() => {
    const sync = () => setEnabled(consentGranted());
    sync();
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function toggle() {
    const next = !enabled;
    if (!setAnalyticsConsent(next)) {
      setStorageError(true);
      return;
    }
    setStorageError(false);
    setEnabled(next);
  }

  return (
    <section id="analytics-opt-out" className="grid gap-3 border-b py-8 sm:grid-cols-[13rem_1fr] sm:gap-8">
      <h2 className="text-lg font-semibold">{zh ? "停用分析" : "Analytics opt-out"}</h2>
      <div className="space-y-4 leading-7 text-muted-foreground">
        <p>
          {enabled
            ? (zh
              ? "当前浏览器已启用 Google Analytics 4 分析。该偏好保存在本浏览器的本地存储中，清除站点数据后会恢复默认启用。"
              : "Google Analytics 4 is currently enabled in this browser. Your preference is stored locally in this browser and resets to enabled if you clear site data.")
            : (zh
              ? "你已在当前浏览器停用 Google Analytics 4 分析，Anyfile 不会发送分析事件。"
              : "You have opted out of Google Analytics 4 in this browser. Anyfile will not send analytics events.")}
        </p>
        {storageError && (
          <p className="text-sm text-destructive">
            {zh ? "无法写入浏览器本地存储，请检查浏览器隐私或 Cookie 设置。" : "Unable to save your preference to browser storage. Please check your browser privacy or storage settings."}
          </p>
        )}
        <div>
          <Button type="button" variant="outline" onClick={toggle}>
            {enabled
              ? (zh ? "停用分析" : "Opt out of analytics")
              : (zh ? "重新启用分析" : "Re-enable analytics")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function GoogleAnalytics() {
  const pathname = usePathname();
  const lastPath = useRef("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!analyticsEnabled()) return;
    const sync = () => {
      const granted = consentGranted();
      updateAnalyticsConsent(granted);
      setEnabled((prev) => {
        if (granted && !prev) lastPath.current = "";
        return granted;
      });
    };
    sync();
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!enabled || lastPath.current === pathname) return;
    initializeAnalytics();
    lastPath.current = pathname;
    track("page_view", { task_entry: /\/(view|embed)$/.test(safePath(pathname)) ? currentEntry() : taskEntry(pathname) });
    if (/\/(view|embed)$/.test(safePath(pathname))) track("workspace_enter", { task_entry: currentEntry() });
  }, [enabled, pathname]);

  return enabled
    ? <Script id="anyfile-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" crossOrigin="anonymous" />
    : null;
}
