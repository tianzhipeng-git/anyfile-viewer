import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { probePlist } from "./parse";

/** Bounded header probe, shared with the loader's format sniffing. */
export async function probePlistFile({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  return probePlist({ file, signal });
}
