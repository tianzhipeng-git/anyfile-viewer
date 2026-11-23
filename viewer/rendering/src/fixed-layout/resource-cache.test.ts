import { describe, expect, it, vi } from "vitest";

import { SharedResourceCache } from "./resource-cache";

describe("SharedResourceCache", () => {
  it("shares loads, keeps pinned values and evicts least recently used ones over budget", async () => {
    const load = vi.fn(async (key: string) => ({ value: { key }, cost: 10 }));
    const close = vi.fn();
    const cache = new SharedResourceCache(15, load, close);

    const first = await cache.acquire(["a", "a"]);
    const second = await cache.acquire(["b"]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(close).not.toHaveBeenCalled(); // both pinned although over budget

    first.release();
    first.release();
    expect(close).toHaveBeenCalledWith({ key: "a" });
    expect(second.values.get("b")).toEqual({ key: "b" });
    second.release();

    await cache.acquire(["b"]);
    expect(load).toHaveBeenCalledTimes(2);
    cache.dispose();
    expect(close).toHaveBeenCalledWith({ key: "b" });
  });

  it("maps failed loads to null but propagates aborts", async () => {
    const cache = new SharedResourceCache<string>(1, async (key) => {
      if (key === "abort") throw new DOMException("aborted", "AbortError");
      throw new Error("broken");
    });
    expect((await cache.acquire(["bad"])).values.get("bad")).toBeNull();
    await expect(cache.acquire(["abort"])).rejects.toMatchObject({ name: "AbortError" });
  });
});
