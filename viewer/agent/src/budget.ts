import {
  AGENT_ERROR_CODES,
  AgentError,
  DEFAULT_INSPECT_MAX_BYTES,
  DEFAULT_READ_MAX_BYTES,
  HARD_READ_MAX_BYTES,
  ViewerError,
  isViewerAbortError,
  truncateUtf8,
  type AgentErrorCode,
  type AgentFileError,
  type InspectPayload,
  type ReadResult,
} from "@anyfile/viewer-protocol";

const encoder = new TextEncoder();
const VALID_CODES = new Set<string>(AGENT_ERROR_CODES);

export function normalizeMaxBytes(requested?: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_READ_MAX_BYTES;
  }
  return Math.min(Math.floor(requested), HARD_READ_MAX_BYTES);
}

export function trimReadResult(result: ReadResult, maxBytes: number): ReadResult {
  // Extractors must honor maxBytes (enforced by the compliance suite); this only guards the wire.
  const trimmed = truncateUtf8(result.content, normalizeMaxBytes(maxBytes));
  return trimmed.truncated ? { ...result, content: trimmed.text, truncated: true } : result;
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
