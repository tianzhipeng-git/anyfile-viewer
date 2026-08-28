import type { HeifDecodeInfo } from "./types";

export const HEIF_ARTIFACT_VERSION = "1.23.2-anyfile.1";
const ASSET_ROOT = `/vendor/libheif/${HEIF_ARTIFACT_VERSION}`;

interface DecoderModule {
  decodePrimary(data: Uint8Array): HeifDecodeInfo;
}

type DecoderFactory = (options: { locateFile(path: string): string }) => Promise<DecoderModule>;

let runtime: Promise<DecoderModule> | undefined;

export function loadHeifRuntime() {
  return runtime ??= import(/* webpackIgnore: true */ `${ASSET_ROOT}/heif-decoder.js`)
    .then((module) => (module.default as DecoderFactory)({ locateFile: () => `${ASSET_ROOT}/heif-decoder.wasm` }))
    .catch((error) => {
      runtime = undefined;
      throw error;
    });
}
