import * as duckdb from "@duckdb/duckdb-wasm/dist/duckdb-browser.mjs";
import { initializeRuntimeFromSources, type RuntimeSource } from "@anyfile/runtime-assets";

const R2_ASSET_ROOT = "https://assets.anyfile.top/vendor/duckdb/1.32.0";

const R2_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: `${R2_ASSET_ROOT}/duckdb-mvp.wasm`,
    mainWorker: `${R2_ASSET_ROOT}/duckdb-browser-mvp.worker.js`,
  },
  eh: {
    mainModule: `${R2_ASSET_ROOT}/duckdb-eh.wasm`,
    mainWorker: `${R2_ASSET_ROOT}/duckdb-browser-eh.worker.js`,
  },
};

const LOCAL_ASSET_ROOT = "/vendor/duckdb/1.32.0";

function localAssetUrl(fileName: string): string {
  const path = `${LOCAL_ASSET_ROOT}/${fileName}`;
  const origin = globalThis.location?.origin;
  return origin && origin !== "null" ? `${origin}${path}` : path;
}

const LOCAL_BUNDLES = (): duckdb.DuckDBBundles => ({
  mvp: {
    mainModule: localAssetUrl("duckdb-mvp.wasm"),
    mainWorker: localAssetUrl("duckdb-browser-mvp.worker.js"),
  },
  eh: {
    mainModule: localAssetUrl("duckdb-eh.wasm"),
    mainWorker: localAssetUrl("duckdb-browser-eh.worker.js"),
  },
});

export async function createDuckDBRuntime(signal: AbortSignal) {
  const sources: RuntimeSource<duckdb.DuckDBBundles>[] = [
    { name: "jsDelivr", value: duckdb.getJsDelivrBundles() },
    { name: "R2", value: R2_BUNDLES },
    { name: "local", value: LOCAL_BUNDLES() },
  ];
  return initializeRuntimeFromSources({
    signal,
    sources,
    errorMessage: "Unable to initialize DuckDB from jsDelivr, R2, or local assets",
    abortMessage: "Viewer operation aborted.",
    async createAttempt(source) {
      const bundle = await duckdb.selectBundle(source.value);
      if (!bundle.mainWorker) throw new Error("No compatible DuckDB worker bundle");
      const worker = await duckdb.createWorker(bundle.mainWorker);
      const database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
      return {
        async initialize() {
          await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
          return database;
        },
        async dispose() {
          await database.terminate().catch(() => undefined);
        },
      };
    },
  });
}
