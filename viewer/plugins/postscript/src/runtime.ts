export const STET_ARTIFACT_VERSION = "0.8.1-anyfile.1";
export const STET_JSDELIVR_REVISION = "296f90ad07f025082cc76b237f1fab0ad53b1e50";

const JSDELIVR_ASSET_ROOT = `https://cdn.jsdelivr.net/gh/tianzhipeng-git/anyfile-viewer@${STET_JSDELIVR_REVISION}/third_party/stet-wasm/${STET_ARTIFACT_VERSION}`;
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
  source("jsDelivr", JSDELIVR_ASSET_ROOT),
  source("R2", R2_ASSET_ROOT),
  source("local", LOCAL_ASSET_ROOT),
] as const;
