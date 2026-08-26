import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cdnBundles: {
    mvp: { mainModule: "https://cdn.example/duckdb.wasm", mainWorker: "https://cdn.example/worker.js" },
  },
  createWorker: vi.fn(async (url: string) => ({ url } as unknown as Worker)),
  instantiate: vi.fn(async () => undefined),
  terminate: vi.fn(async () => undefined),
}));

vi.mock("@duckdb/duckdb-wasm", () => ({
  getJsDelivrBundles: () => mocks.cdnBundles,
  selectBundle: vi.fn(async (bundles: typeof mocks.cdnBundles) => ({
    mainModule: bundles.mvp.mainModule,
    mainWorker: bundles.mvp.mainWorker,
    pthreadWorker: null,
  })),
  createWorker: mocks.createWorker,
  VoidLogger: class VoidLogger {},
  AsyncDuckDB: class AsyncDuckDB {
    instantiate = mocks.instantiate;
    terminate = mocks.terminate;
  },
}));

import { createDuckDBRuntime } from "./duckdb-runtime";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DuckDB runtime loading", () => {
  it("uses the jsDelivr bundle first", async () => {
    await createDuckDBRuntime(new AbortController().signal);

    expect(mocks.createWorker).toHaveBeenCalledOnce();
    expect(mocks.createWorker).toHaveBeenCalledWith("https://cdn.example/worker.js");
    expect(mocks.instantiate).toHaveBeenCalledWith("https://cdn.example/duckdb.wasm", null);
  });

  it("falls back to local assets when CDN initialization fails", async () => {
    mocks.instantiate.mockRejectedValueOnce(new Error("CDN unavailable"));

    await createDuckDBRuntime(new AbortController().signal);

    expect(mocks.createWorker).toHaveBeenCalledTimes(2);
    expect(mocks.createWorker.mock.calls[1]?.[0]).not.toContain("cdn.example");
    expect(mocks.terminate).toHaveBeenCalledOnce();
  });
});
