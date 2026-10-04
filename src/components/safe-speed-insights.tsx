"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { safePath } from "@/lib/analytics/events";

export function SafeSpeedInsights() {
  return <SpeedInsights beforeSend={(event) => {
    const url = new URL(event.url);
    return { ...event, url: url.origin + safePath(url.pathname) };
  }} />;
}
