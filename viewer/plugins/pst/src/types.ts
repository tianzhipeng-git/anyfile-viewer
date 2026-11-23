export type PstErrorCode = "invalid-file" | "resource-limit" | "unsupported";

export class PstError extends Error {
  constructor(readonly code: PstErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PstError";
  }
}

export function invalid(message: string): never {
  throw new PstError("invalid-file", message);
}

/** Bounds so a malformed or hostile archive cannot exhaust memory or loop forever. */
export const PST_LIMITS = {
  /** Largest single node stream (property heap, table rows, body) decoded at once. */
  maxNodeBytes: 64 * 1024 * 1024,
  /** Largest attachment materialized for download. */
  maxAttachmentBytes: 512 * 1024 * 1024,
  maxTreeDepth: 16,
  maxSubnodes: 100_000,
  maxFolderChildren: 10_000,
  maxRecipients: 5_000,
  maxAttachments: 1_000,
  /** Embedded inline (cid:) images loaded for one HTML body. */
  maxInlineImageBytes: 32 * 1024 * 1024,
} as const;

export function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
}
