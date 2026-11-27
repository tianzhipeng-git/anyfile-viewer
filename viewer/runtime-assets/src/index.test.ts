import { afterEach, describe, expect, it, vi } from "vitest";

import {
  initializeRuntimeFromSources,
  isLocalOriginFirst,
  setLocalOriginFirst,
} from "./index";

afterEach(() => {
  setLocalOriginFirst(false);
});

describe("initializeRuntimeFromSources", () => {
  it("disposes a failed attempt before trying the next source", async () => {
    const disposed: string[] = [];
    const result = await initializeRuntimeFromSources({
      signal: new AbortController().signal,
      sources: [{ name: "primary", value: 1 }, { name: "fallback", value: 2 }],
      errorMessage: "unavailable",
      async createAttempt(source) {
        return {
          async initialize() {
            if (source.name === "primary") throw new Error("failed");
            return source.value;
          },
          dispose() { disposed.push(source.name); },
        };
      },
    });

    expect(result).toBe(2);
    expect(disposed).toEqual(["primary"]);
  });

  it("tries every source once and retains each failure", async () => {
    const createAttempt = vi.fn(async ({ name }: { name: string }) => ({
      async initialize(): Promise<never> { throw new Error(name); },
      dispose() {},
    }));

    await expect(initializeRuntimeFromSources({
      signal: new AbortController().signal,
      sources: [{ name: "one", value: 1 }, { name: "two", value: 2 }],
      errorMessage: "all failed",
      createAttempt,
    })).rejects.toMatchObject({ message: "all failed", errors: [{ message: "one" }, { message: "two" }] });
    expect(createAttempt).toHaveBeenCalledTimes(2);
  });

  it("stops fallback after cancellation and disposes the active attempt", async () => {
    const controller = new AbortController();
    const dispose = vi.fn();

    await expect(initializeRuntimeFromSources({
      signal: controller.signal,
      sources: [{ name: "one", value: 1 }, { name: "two", value: 2 }],
      errorMessage: "all failed",
      async createAttempt() {
        return {
          async initialize() {
            controller.abort();
            throw new Error("cancelled");
          },
          dispose,
        };
      },
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("skips external CDN/R2 sources when local-origin-first mode is enabled", async () => {
    expect(isLocalOriginFirst()).toBe(false);
    setLocalOriginFirst(true);
    expect(isLocalOriginFirst()).toBe(true);
    expect((globalThis as { __ANYFILE_LOCAL_ORIGIN_FIRST__?: boolean }).__ANYFILE_LOCAL_ORIGIN_FIRST__).toBe(true);

    const attempted: string[] = [];
    const result = await initializeRuntimeFromSources({
      signal: new AbortController().signal,
      sources: [
        { name: "jsDelivr", value: "https://cdn.jsdelivr.net/npm/pkg@1.0.0/index.js" },
        { name: "R2", value: "https://assets.anyfile.top/vendor/pkg/1.0.0/index.js" },
        { name: "local", value: "/vendor/pkg/1.0.0/index.js" },
      ],
      errorMessage: "unavailable",
      async createAttempt(source) {
        attempted.push(source.name);
        return {
          async initialize() {
            return source.value;
          },
          dispose() {},
        };
      },
    });

    expect(result).toBe("/vendor/pkg/1.0.0/index.js");
    expect(attempted).toEqual(["local"]);
  });

  it("recognizes relative URL sources in local-origin-first mode and does not fall back to external sources on failure", async () => {
    (globalThis as { __ANYFILE_LOCAL_ORIGIN_FIRST__?: boolean }).__ANYFILE_LOCAL_ORIGIN_FIRST__ = true;
    const attempted: string[] = [];

    await expect(initializeRuntimeFromSources({
      signal: new AbortController().signal,
      sources: [
        { name: "R2", value: "https://assets.anyfile.top/vendor/pkg/1.0.0/index.js" },
        { name: "same-origin", value: "/vendor/pkg/1.0.0/index.js" },
      ],
      errorMessage: "local failed",
      async createAttempt(source) {
        attempted.push(source.name);
        return {
          async initialize(): Promise<never> {
            throw new Error(`failed ${source.name}`);
          },
          dispose() {},
        };
      },
    })).rejects.toMatchObject({ message: "local failed" });

    expect(attempted).toEqual(["same-origin"]);
  });
});
