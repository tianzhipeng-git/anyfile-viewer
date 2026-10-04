"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { analyticsEnabled, CONSENT_KEY, consentGranted, currentEntry, GA_ID, initializeAnalytics, safePath, taskEntry, track, updateAnalyticsConsent } from "@/lib/analytics/events";

export function AnalyticsPreferences({ locale }: { locale: string }) {
  return <button type="button" className="text-left text-muted-foreground hover:text-foreground" onClick={() => window.dispatchEvent(new Event("analytics-preferences"))}>{locale === "zh-CN" ? "分析偏好" : "Analytics preferences"}</button>;
}

export function GoogleAnalytics({ locale }: { locale: string }) {
  const pathname = usePathname();
  const lastPath = useRef("");
  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const zh = locale === "zh-CN";
  useEffect(() => {
    if (!analyticsEnabled()) return;
    // Read browser preferences after hydration.
    const sync = () => {
      updateAnalyticsConsent(consentGranted());
      setEnabled(consentGranted());
      try { setPrompt(!localStorage.getItem(CONSENT_KEY)); } catch { setPrompt(true); }
    };
    const preferences = () => setPrompt(true);
    sync();
    window.addEventListener("analytics-preferences", preferences);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("analytics-preferences", preferences);
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
  function choose(granted: boolean) {
    try { localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied"); } catch { return; }
    updateAnalyticsConsent(granted);
    if (granted && !enabled) lastPath.current = "";
    setEnabled(granted);
    setPrompt(false);
  }
  return <>
    {enabled && <Script id="anyfile-ga4" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" crossOrigin="anonymous" />}
    {prompt && <section aria-label={zh ? "分析偏好" : "Analytics preferences"} className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border bg-background p-4 text-sm shadow-lg">
      <p>{zh ? "允许使用 Google Analytics 的分析 Cookie，帮助我们了解访问来源和预览是否成功？不发送文件名或文件内容。拒绝不影响查看文件。" : "Allow Google Analytics cookies to help us understand traffic sources and preview results? File names and contents are never sent. You can view files without accepting."}</p>
      <div className="mt-3 flex flex-wrap gap-4">
        <button type="button" className="underline" onClick={() => choose(true)}>{zh ? "允许分析" : "Allow analytics"}</button>
        <button type="button" className="underline" onClick={() => choose(false)}>{zh ? "拒绝" : "Decline"}</button>
        <a className="underline" href={`/${locale}/privacy`}>{zh ? "隐私政策" : "Privacy policy"}</a>
      </div>
    </section>}
  </>;
}
