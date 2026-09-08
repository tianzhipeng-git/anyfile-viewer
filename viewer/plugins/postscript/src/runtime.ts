export const STET_ARTIFACT_VERSION = "0.8.1-anyfile.1";

const R2_ASSET_ROOT = `https://assets.anyfile.top/vendor/stet/${STET_ARTIFACT_VERSION}`;
const LOCAL_ASSET_ROOT = `/vendor/stet/${STET_ARTIFACT_VERSION}`;

function source(name: string, root: string) {
  return {
    name,
    runtimeUrl: `${root}/stet_wasm.js`,
    wasmUrl: `${root}/stet_wasm_bg.wasm`,
  } as const;
}

export const STET_ASSET_SOURCES = [
  source("R2", R2_ASSET_ROOT),
  source("local", LOCAL_ASSET_ROOT),
] as const;
