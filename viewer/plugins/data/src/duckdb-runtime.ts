import * as duckdb from "@duckdb/duckdb-wasm";

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
  const sources = [duckdb.getJsDelivrBundles(), LOCAL_BUNDLES];
  for (const bundles of sources) {
    if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
    try {
      return await instantiateBundle(bundles);
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, "Unable to initialize DuckDB from jsDelivr or local assets");
}
