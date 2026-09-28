import { viewerManifests } from "../../content/manifests";
import type { ViewerPreviewResult } from "@anyfile/viewer-protocol";

export const GA_ID = "G-289W10FK5X";
export const CONSENT_KEY = "anyfile-analytics-consent";
type Params = Record<string, string | number>;
type EventName = "page_view" | "workspace_enter" | "file_selected" | "file_picker_cancelled" | "open_started" | "viewer_initialized" | "open_result" | "video_playback" | "preview_error";

declare global {
  interface Window {
    "ga-disable-G-289W10FK5X"?: boolean;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const extensions = [...new Set(viewerManifests.flatMap((manifest) => manifest.formats.flatMap((format) => format.extensions)))].filter((extension) => extension !== "*").sort((a, b) => b.length - a.length);
const pluginIds = new Set(viewerManifests.map((manifest) => manifest.id));

export function fileProperties(file: File) {
  return {
    format: extensions.find((extension) => file.name.toLowerCase().endsWith(extension))?.slice(1) ?? "unknown",
    size_bucket: file.size < 1024 ** 2 ? "under_1mb" : file.size < 10 * 1024 ** 2 ? "1_10mb" : file.size < 100 * 1024 ** 2 ? "10_100mb" : file.size < 1024 ** 3 ? "100mb_1gb" : "over_1gb",
  };
}

// Paths are application routes only; query strings, fragments and arbitrary paths never leave the device.
export function safePath(path: string): string {
  const match = /^\/(en|zh-CN)(?:\/(.*))?\/?$/.exec(path.split(/[?#]/)[0]);
  if (!match) return "/unknown";
  const route = (match[2] ?? "").replace(/\/$/, "");
  if (["", "view", "about", "privacy", "contact", "formats", "categories", "plugins", "viewers"].includes(route)) return `/${match[1]}${route ? `/${route}` : ""}`;
  const [section, value, extra] = route.split("/");
  if (!extra && ((section === "formats" && extensions.includes(`.${value}`)) || (section === "plugins" && pluginIds.has(value)) || (section === "categories" && ["images-video", "360-cameras", "documents", "engineering", "code-data", "developer-artifacts", "ebooks", "graphic-design", "3d-models"].includes(value)) || (section === "viewers" && ["insta360", "gopro-max", "dji-osmo-360"].includes(value)))) return `/${match[1]}/${section}/${value}`;
  return `/${match[1]}/other`;
}

export function taskEntry(path: string): string {
  const route = safePath(path).replace(/^\/(en|zh-CN)\/?/, "");
  return !route ? "home" : route === "view" || route === "other" || route === "/unknown" ? "direct" : route.replaceAll("/", "_");
}

export function currentEntry(): string {
  const entry = new URLSearchParams(window.location.search).get("entry");
  return entry ? taskEntry(entry) : "direct";
}

export function consentGranted(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === "granted"; } catch { return false; }
}

export function analyticsEnabled(): boolean {
  return process.env.NODE_ENV === "production" && typeof window !== "undefined" && ["anyfile.top", "www.anyfile.top"].includes(window.location.hostname);
}

export function updateAnalyticsConsent(granted: boolean) {
  window["ga-disable-G-289W10FK5X"] = !granted;
  window.gtag?.("consent", "update", { analytics_storage: granted ? "granted" : "denied" });
}

let initialized = false;
export function initializeAnalytics() {
  if (initialized || !analyticsEnabled() || !consentGranted()) return;
  initialized = true;
  window.dataLayer ??= [];
  // Google tag command queues require an Arguments object (the documented gtag snippet).
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, page_location: window.location.origin + safePath(window.location.pathname), page_referrer: safeReferrer(document.referrer), page_title: safePath(window.location.pathname) });
}

export function safeReferrer(value: string): string {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    return ["anyfile.top", "www.anyfile.top"].includes(url.hostname) ? url.origin + safePath(url.pathname) : url.origin;
  } catch { return ""; }
}

export function track(name: EventName, params: Params = {}) {
  if (!analyticsEnabled() || !consentGranted()) return;
  initializeAnalytics();
  const page = { page_location: window.location.origin + safePath(window.location.pathname), page_title: safePath(window.location.pathname), page_referrer: safeReferrer(document.referrer) };
  const allowed = ["task_entry", "file_source", "format", "size_bucket", "plugin", "outcome", "duration_ms", "preview_kind", "reason_code"];
  const safe = Object.fromEntries(Object.entries(params).filter(([key]) => allowed.includes(key)));
  if (name === "page_view") window.gtag?.("set", page);
  window.gtag?.("event", name, { ...safe, ...page });
}

export type FileSource = "user" | "sample";
export function createOpenAttempt(file: File, source: FileSource, entry: string, emit: typeof track = track) {
  // Do not send a result without its start if consent is granted halfway through an attempt.
  if (emit === track && (!analyticsEnabled() || !consentGranted())) emit = () => {};
  const started = performance.now();
  const base = { ...fileProperties(file), file_source: source, task_entry: entry };
  let plugin = "unresolved";
  let ended = false;
  let previewSucceeded = false;
  let initialized = false;
  let stopped = false;
  let played = false;
  let failedAfterPreview = false;
  emit("open_started", base);
  function finish(outcome: string, details: Params = {}) {
    if (ended || stopped) return;
    ended = true;
    previewSucceeded = outcome === "success";
    emit("open_result", { ...base, plugin, outcome, duration_ms: Math.round(performance.now() - started), ...details });
  }
  return {
    selectPlugin(id: string) { plugin = pluginIds.has(id) ? id : "unknown"; },
    initialized() {
      if (stopped || initialized) return;
      initialized = true;
      emit("viewer_initialized", { ...base, plugin });
      if (plugin === "hex-viewer") finish("fallback", { preview_kind: "hex" });
    },
    report(result: ViewerPreviewResult) {
      if (stopped) return;
      if (result.outcome === "failure") {
        if (!ended) finish("failure", { reason_code: result.reason });
        else if (previewSucceeded && !failedAfterPreview) {
          failedAfterPreview = true;
          emit("preview_error", { ...base, plugin, reason_code: result.reason });
        }
      } else if (result.kind === "video_playback") {
        if (previewSucceeded && !played) { played = true; emit("video_playback", { ...base, plugin }); }
      } else finish(plugin === "hex-viewer" ? "fallback" : "success", { preview_kind: result.kind });
    },
    fail(reason: string) { finish("failure", { reason_code: reason }); },
    stop() { finish(initialized ? "unmeasured" : "cancelled", { reason_code: initialized ? "no-preview-signal" : "superseded" }); stopped = true; },
  };
}
export type OpenAttempt = ReturnType<typeof createOpenAttempt>;
