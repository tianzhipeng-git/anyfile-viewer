import { importRuntime } from "@anyfile/runtime-assets";
import type { VendorAssets } from "@anyfile/viewer-protocol";
import type { HeifDecodeInfo } from "./types";

export const HEIF_ARTIFACT_VERSION = "1.23.2-anyfile.1";
/** Same `<pkg>/<version>` path under `/vendor/` for the Web host and the Agent vendor cache. */
const VENDOR_DIR = `libheif/${HEIF_ARTIFACT_VERSION}`;
const ASSET_ROOT = `/vendor/${VENDOR_DIR}`;

export interface HeifDecoderModule {
  decodePrimary(data: Uint8Array): HeifDecodeInfo;
}

type DecoderFactory = (options: { locateFile?(path: string): string; wasmBinary?: Uint8Array }) => Promise<HeifDecoderModule>;

let runtime: Promise<HeifDecoderModule> | undefined;

export function loadHeifRuntime() {
  return runtime ??= importRuntime<{ default: DecoderFactory }>(`${ASSET_ROOT}/heif-decoder.js`)
    .then((module) => module.default({ locateFile: () => `${ASSET_ROOT}/heif-decoder.wasm` }))
    .catch((error) => {
      runtime = undefined;
      throw error;
    });
}

/** Node (Agent) loader: same artifact, glue and wasm bytes resolved through the local vendor cache. */
export async function loadHeifRuntimeFromVendor(vendor: VendorAssets) {
  const glue = await importRuntime<{ default: DecoderFactory }>(await vendor.url(`${VENDOR_DIR}/heif-decoder.js`));
  return glue.default({ wasmBinary: await vendor.bytes(`${VENDOR_DIR}/heif-decoder.wasm`) });
}

/** Maps adapter `category: message` failures and wasm traps to a coarse error code. */
export function classifyHeifError(error: unknown): "resource-limit" | "unsupported-environment" | "open-failed" | "invalid-file" {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("resource-limit:")) return "resource-limit";
  if (error instanceof RangeError || /(?:out of memory|memory access out of bounds|allocation failed|bad_alloc)/i.test(message)) return "resource-limit";
  if (message.startsWith("unsupported-environment:")) return "unsupported-environment";
  if (message.startsWith("runtime:")) return "open-failed";
  return "invalid-file";
}
