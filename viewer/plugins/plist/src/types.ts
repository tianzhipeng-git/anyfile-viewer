export type PlistValue =
  | { readonly kind: "dict"; readonly entries: readonly { readonly key: string; readonly value: PlistValue }[] }
  | { readonly kind: "array"; readonly items: readonly PlistValue[] }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "integer"; readonly value: bigint }
  | { readonly kind: "real"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "date"; readonly value: Date }
  | { readonly kind: "data"; readonly value: Uint8Array }
  | { readonly kind: "uid"; readonly value: bigint }
  | { readonly kind: "null" };

export type PlistErrorCode = "invalid-file" | "resource-limit";

export class PlistError extends Error {
  constructor(readonly code: PlistErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PlistError";
  }
}

/** Bounds shared by both decoders so a malformed file cannot exhaust memory or time. */
export const PLIST_LIMITS = {
  maxNodes: 500_000,
  maxDepth: 2048,
  maxDataBytes: 64 * 1024 * 1024,
} as const;
