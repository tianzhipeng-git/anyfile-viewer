import {
  AGENT_ERROR_CODES,
  AgentError,
  DEFAULT_INSPECT_MAX_BYTES,
  DEFAULT_READ_MAX_BYTES,
  HARD_READ_MAX_BYTES,
  ViewerError,
  isViewerAbortError,
  type AgentErrorCode,
  type AgentFileError,
  type InspectPayload,
  type ReadResult,
} from "@anyfile/viewer-protocol";

const MAX_OUTPUT_LINES = 2000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });
const VALID_CODES = new Set<string>(AGENT_ERROR_CODES);

export function normalizeMaxBytes(requested?: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_READ_MAX_BYTES;
  }
  return Math.min(Math.floor(requested), HARD_READ_MAX_BYTES);
}

/**
 * Truncates a UTF-8 string so its encoded byte length is at most `maxBytes`
 * without splitting multi-byte UTF-8 sequences.
 */
export function truncateUtf8(text: string, maxBytes: number): { readonly text: string; readonly truncated: boolean } {
  const bytes = encoder.encode(text);
  if (bytes.byteLength <= maxBytes) return { text, truncated: false };
  let cut = maxBytes;
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) {
    cut -= 1;
  }
  return { text: decoder.decode(bytes.subarray(0, cut)), truncated: true };
}

/**
 * Safety-net trimmer applied by `agent-core` to every `ReadResult` (both `read` and `query`).
 */
export function trimReadResult(result: ReadResult, maxBytes: number): ReadResult {
  const bound = normalizeMaxBytes(maxBytes);
  let content = result.content;
  let truncated = result.truncated;

  const lines = content.split("\n");
  if (lines.length > MAX_OUTPUT_LINES) {
    content = lines.slice(0, MAX_OUTPUT_LINES).join("\n");
    truncated = true;
  }

  const byteTrimmed = truncateUtf8(content, bound);
  if (byteTrimmed.truncated) {
    content = byteTrimmed.text;
    truncated = true;
  }

  return {
    ...result,
    content,
    truncated,
  };
}

/**
 * Trims `InspectPayload.targets` when the serialized payload exceeds the inspect byte budget (8 KiB).
 */
export function trimInspectPayload(
  payload: InspectPayload,
  maxBytes = DEFAULT_INSPECT_MAX_BYTES,
): InspectPayload {
  const serialized = encoder.encode(JSON.stringify(payload)).byteLength;
  if (serialized <= maxBytes) return payload;

  let lo = 0;
  let hi = payload.targets.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate: InspectPayload = {
      metadata: payload.metadata,
      targets: payload.targets.slice(0, mid),
      targetsTruncated: true,
    };
    if (encoder.encode(JSON.stringify(candidate)).byteLength <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return {
    metadata: payload.metadata,
    targets: payload.targets.slice(0, lo),
    targetsTruncated: true,
  };
}

function mapViewerErrorCode(code: ViewerError["code"]): AgentErrorCode {
  switch (code) {
    case "invalid-file":
      return "invalid-file";
    case "missing-related-file":
      return "missing-related-file";
    case "resource-limit":
      return "resource-limit";
    case "runtime-unavailable":
    case "unsupported-environment":
      return "runtime-unavailable";
    case "open-failed":
    default:
      return "invalid-file";
  }
}

export function toAgentFileError(error: unknown, pluginId?: string): AgentFileError {
  if (error instanceof AgentError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.pluginId ?? pluginId ? { pluginId: error.pluginId ?? pluginId } : {}),
    };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    VALID_CODES.has((error as { code: string }).code)
  ) {
    const err = error as { code: AgentErrorCode; message?: unknown; pluginId?: unknown };
    return {
      code: err.code,
      message: typeof err.message === "string" && err.message ? err.message : `Operation failed (${err.code}).`,
      ...(typeof err.pluginId === "string" ? { pluginId: err.pluginId } : pluginId ? { pluginId } : {}),
    };
  }
  if (error instanceof ViewerError) {
    return {
      code: mapViewerErrorCode(error.code),
      message: error.message,
      ...(pluginId ? { pluginId } : {}),
    };
  }
  if (isViewerAbortError(error)) {
    return {
      code: "timeout",
      message: "Operation was cancelled or timed out.",
      ...(pluginId ? { pluginId } : {}),
    };
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const nodeCode = String((error as { code: unknown }).code);
    if (nodeCode === "ENOENT" || nodeCode === "EACCES" || nodeCode === "EPERM") {
      return { code: "access-denied", message: "File could not be accessed.", ...(pluginId ? { pluginId } : {}) };
    }
    if (nodeCode === "ERR_WORKER_OUT_OF_MEMORY") {
      return { code: "resource-limit", message: "Worker exceeded memory limit.", ...(pluginId ? { pluginId } : {}) };
    }
  }
  const message = error instanceof Error && error.message ? error.message.split("\n")[0] : "Failed to process file.";
  return {
    code: "invalid-file",
    message,
    ...(pluginId ? { pluginId } : {}),
  };
}
