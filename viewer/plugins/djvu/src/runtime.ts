export const DJVU_ARTIFACT_VERSION = "3.5.29-anyfile.1";

const R2_ASSET_ROOT = `https://assets.anyfile.top/vendor/djvulibre/${DJVU_ARTIFACT_VERSION}`;
const LOCAL_ASSET_ROOT = `/vendor/djvulibre/${DJVU_ARTIFACT_VERSION}`;

function source(name: string, root: string) {
  return {
    name,
    runtimeUrl: `${root}/djvu.js`,
    wasmUrl: `${root}/djvu.wasm`,
  } as const;
}

export const DJVU_ASSET_SOURCES = [
  source("R2", R2_ASSET_ROOT),
  source("local", LOCAL_ASSET_ROOT),
] as const;
