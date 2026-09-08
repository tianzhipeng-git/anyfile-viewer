import { describe, expect, it, vi } from "vitest";

import { initializeRuntimeFromSources } from "./index";

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
});
