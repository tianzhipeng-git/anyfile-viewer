import { describe, expect, it, vi } from "vitest";
import { createOpenAttempt, fileProperties, safePath, safeReferrer, taskEntry } from "./events";

const file = () => new File(["private content"], "customer-secret.psb");
describe("product measurement", () => {
  it("does not count initialization as successful content and records unmeasured separately", () => {
    const emit = vi.fn();
    const attempt = createOpenAttempt(file(), "user", "formats_psb", emit);
    attempt.selectPlugin("photoshop-document");
    attempt.initialized();
    expect(emit.mock.calls.map(([name]) => name)).toEqual(["open_started", "viewer_initialized"]);
    attempt.stop();
    expect(emit.mock.lastCall?.[1]).toMatchObject({ outcome: "unmeasured" });
  });
  it("deduplicates successful preview, ignores late callbacks and never cancels a success", () => {
    const emit = vi.fn();
    const attempt = createOpenAttempt(file(), "user", "formats_psb", emit);
    attempt.report({ outcome: "success", kind: "static" });
    attempt.report({ outcome: "success", kind: "static" });
    attempt.stop();
    attempt.report({ outcome: "failure", reason: "invalid-file" });
    expect(emit.mock.calls.filter(([name]) => name === "open_result")).toHaveLength(1);
    expect(emit.mock.lastCall?.[1]).toMatchObject({ outcome: "success", preview_kind: "static", file_source: "user" });
  });
  it("records failure once and cancellation separately", () => {
    const emit = vi.fn();
    const failed = createOpenAttempt(file(), "user", "direct", emit);
    failed.fail("resource-limit"); failed.stop();
    const cancelled = createOpenAttempt(file(), "user", "direct", emit);
    cancelled.stop(); cancelled.report({ outcome: "success", kind: "static" });
    expect(emit.mock.calls.filter(([name]) => name === "open_result").map(([, p]) => p.outcome)).toEqual(["failure", "cancelled"]);
  });
  it("separates sample files and Hex from target task completion", () => {
    const emit = vi.fn();
    const attempt = createOpenAttempt(file(), "sample", "formats_psb", emit);
    attempt.selectPlugin("hex-viewer"); attempt.initialized(); attempt.stop();
    expect(emit.mock.lastCall?.[1]).toMatchObject({ outcome: "fallback", preview_kind: "hex", file_source: "sample" });
  });
  it("counts playback once, independently of the first frame, and reports later failures", () => {
    const emit = vi.fn();
    const attempt = createOpenAttempt(file(), "user", "direct", emit);
    attempt.report({ outcome: "success", kind: "video_frame" });
    attempt.report({ outcome: "success", kind: "video_playback" });
    attempt.report({ outcome: "success", kind: "video_playback" });
    attempt.report({ outcome: "failure", reason: "open-failed" });
    attempt.report({ outcome: "failure", reason: "open-failed" });
    expect(emit.mock.calls.map(([name]) => name)).toEqual(["open_started", "open_result", "video_playback", "preview_error"]);
  });
  it("never includes file names, unknown extensions, query strings, or remote paths", () => {
    expect(fileProperties(file())).toEqual({ format: "psb", size_bucket: "under_1mb" });
    expect(fileProperties(new File([], "file.customer-secret")).format).toBe("unknown");
    expect(fileProperties(new File([], "private.tar.gz")).format).toBe("tar.gz");
    expect(safePath("/en/view?url=https://secret.example/private#password")).toBe("/en/view");
    expect(safePath("/en/formats/private-name")).toBe("/en/other");
    expect(safeReferrer("https://example.com/private?token=secret")).toBe("https://example.com");
    expect(safeReferrer("file:///private/name")).toBe("");
    const emit = vi.fn();
    createOpenAttempt(file(), "user", "direct", emit).fail("invalid-file");
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/customer-secret|private content/);
  });
  it("retains valid task entries including panorama and category routes", () => {
    expect(taskEntry("/en/viewers/dji-osmo-360")).toBe("viewers_dji-osmo-360");
    expect(taskEntry("/zh-CN/categories/360-cameras")).toBe("categories_360-cameras");
    expect(taskEntry("https://example.com/private")).toBe("direct");
  });
});


describe("animation interaction measurement", () => {
  it("separates autoplay from explicit actions and deduplicates each action per opening", () => {
    const emit = vi.fn();
    const attempt = createOpenAttempt(new File([], "private.gif"), "sample", "formats_gif", emit);
    attempt.selectPlugin("browser-image");
    attempt.report({ outcome: "success", kind: "animation" });
    expect(emit.mock.calls.map(([name]) => name)).toEqual(["open_started", "open_result"]);
    attempt.interact({ kind: "animation_control", action: "pause" });
    attempt.interact({ kind: "animation_control", action: "pause" });
    attempt.interact({ kind: "animation_control", action: "next_frame" });
    attempt.interact({ kind: "animation_control", action: "speed_change" });
    attempt.interact({ kind: "animation_control", action: "speed_change" });
    attempt.stop();
    attempt.interact({ kind: "animation_control", action: "play" });
    expect(emit.mock.calls.filter(([name]) => name === "animation_control").map(([, p]) => p.action)).toEqual(["pause", "next_frame", "speed_change"]);
    expect(emit.mock.lastCall?.[1]).toMatchObject({ file_source: "sample", plugin: "browser-image" });
    expect(JSON.stringify(emit.mock.calls)).not.toContain("private.gif");
  });
});
