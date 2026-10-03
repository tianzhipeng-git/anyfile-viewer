import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  window.location.href = "https://www.anyfile.top/en/view?url=https://private.example/secret#token";
  localStorage.clear();
  delete window["ga-disable-G-289W10FK5X"];
  delete window.gtag;
  delete window.dataLayer;
});
afterEach(() => { vi.unstubAllEnvs(); localStorage.clear(); window.location.href = "http://localhost:3000"; });

it("does not load a queue before consent or on preview hosts", async () => {
  const { track, CONSENT_KEY } = await import("./events");
  track("page_view");
  expect(window.dataLayer).toBeUndefined();
  localStorage.setItem(CONSENT_KEY, "granted");
  window.location.href = "https://anyfile-preview.vercel.app/en/view";
  track("page_view");
  expect(window.dataLayer).toBeUndefined();
});

it("configures GA once, strips raw URLs and unapproved properties, and respects revocation", async () => {
  const { track, CONSENT_KEY, GA_ID } = await import("./events");
  localStorage.setItem(CONSENT_KEY, "granted");
  track("page_view");
  track("file_selected", { format: "psb", file_name: "customer.psb", error: "private error" });
  const commands = window.dataLayer!.map((value) => Array.from(value as ArrayLike<unknown>));
  expect(commands.filter(([command]) => command === "config")).toHaveLength(1);
  expect(commands.find(([command]) => command === "config")).toEqual(["config", GA_ID, expect.objectContaining({ send_page_view: false, allow_google_signals: false })]);
  const payload = JSON.stringify(commands);
  expect(payload).not.toMatch(/private.example|customer.psb|private error|#token/);
  const count = window.dataLayer!.length;
  localStorage.setItem(CONSENT_KEY, "denied");
  track("page_view");
  expect(window.dataLayer).toHaveLength(count);
});

it("does not send orphan results when consent changes during an attempt", async () => {
  const { createOpenAttempt, CONSENT_KEY } = await import("./events");
  const attempt = createOpenAttempt(new File([], "local.psb"), "user", "direct");
  localStorage.setItem(CONSENT_KEY, "granted");
  attempt.report({ outcome: "success", kind: "static" });
  expect(window.dataLayer).toBeUndefined();
});

it("uses the Google opt-out flag to stop automatic collection without reloading a local file", async () => {
  const { updateAnalyticsConsent } = await import("./events");
  window.gtag = vi.fn();
  updateAnalyticsConsent(false);
  expect(window["ga-disable-G-289W10FK5X"]).toBe(true);
  expect(window.gtag).toHaveBeenLastCalledWith("consent", "update", { analytics_storage: "denied" });
  updateAnalyticsConsent(true);
  expect(window["ga-disable-G-289W10FK5X"]).toBe(false);
});

it("attributes public and embedded previews without sending the source URL", async () => {
  const { track, currentEntry, CONSENT_KEY } = await import("./events");
  localStorage.setItem(CONSENT_KEY, "granted");
  window.location.href = "https://www.anyfile.top/en/view#file=https%3A%2F%2Fraw.githubusercontent.com%2Fowner%2Frepo%2Ffile.csv";
  expect(currentEntry()).toBe("public_url");
  track("file_selected", { task_entry: currentEntry(), file_source: "remote", format: "csv" });
  window.location.href = "https://www.anyfile.top/en/embed#file=https%3A%2F%2Fraw.githubusercontent.com%2Fowner%2Frepo%2Ffile.csv";
  expect(currentEntry()).toBe("embed");
  track("page_view", { task_entry: currentEntry() });
  const payload = JSON.stringify(window.dataLayer);
  expect(payload).toContain('"file_source":"remote"');
  expect(payload).toContain("https://www.anyfile.top/en/embed");
  expect(payload).not.toMatch(/raw.githubusercontent.com|file.csv|#file/);
});
