import * as duckdb from "@duckdb/duckdb-wasm";

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

const LOCAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm", import.meta.url).toString(),
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js", import.meta.url).toString(),
  },
  eh: {
    mainModule: new URL("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm", import.meta.url).toString(),
    mainWorker: new URL("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js", import.meta.url).toString(),
  },
};

async function instantiateBundle(bundles: duckdb.DuckDBBundles) {
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) throw new Error("No compatible DuckDB worker bundle");
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return database;
  } catch (error) {
    await database.terminate().catch(() => undefined);
    throw error;
  }
}

export async function createDuckDBRuntime(signal: AbortSignal) {
  const errors: unknown[] = [];
  const sources = [duckdb.getJsDelivrBundles(), R2_BUNDLES, LOCAL_BUNDLES];
  for (const bundles of sources) {
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    try {
      return await instantiateBundle(bundles);
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, "Unable to initialize DuckDB from jsDelivr, R2, or local assets");
}
