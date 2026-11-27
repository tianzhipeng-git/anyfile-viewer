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
  type JsonValue,
  type ReadResult,
} from "@anyfile/viewer-protocol";

export const DEFAULT_READ_MAX_LINES = 2000;

const encoder = new TextEncoder();
const VALID_CODES = new Set<string>(AGENT_ERROR_CODES);

function utf8ByteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

export function normalizeMaxBytes(requested?: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_READ_MAX_BYTES;
  }
  return Math.max(1, Math.min(Math.floor(requested), HARD_READ_MAX_BYTES));
}

function truncateLines(text: string, maxLines: number): { readonly text: string; readonly truncated: boolean } {
  if (maxLines <= 0) return { text: "", truncated: text.length > 0 };
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      if (lines >= maxLines) {
        return { text: text.slice(0, i), truncated: true };
      }
      lines += 1;
    }
  }
  return { text, truncated: false };
}

export function trimReadResult(
  result: ReadResult,
  maxBytes: number,
  maxLines = DEFAULT_READ_MAX_LINES,
): ReadResult {
  // Extractors must honor maxBytes (enforced by the compliance suite); this guards the wire for both lines and bytes.
  const lineTrimmed = truncateLines(result.content, maxLines);
  const byteTrimmed = truncateUtf8(lineTrimmed.text, normalizeMaxBytes(maxBytes));
  if (!lineTrimmed.truncated && !byteTrimmed.truncated) return result;
  return {
    content: byteTrimmed.text,
    contentType: result.contentType,
    truncated: true,
    ...(result.filterApplied !== undefined ? { filterApplied: result.filterApplied } : {}),
  };
}

function trimMetadataValue(value: JsonValue, maxStringBytes: number): JsonValue {
  if (typeof value === "string") {
    return truncateUtf8(value, maxStringBytes).text;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 16).map((item) => trimMetadataValue(item, maxStringBytes));
  }
  if (value && typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, val] of Object.entries(value).slice(0, 32)) {
      out[key] = trimMetadataValue(val, maxStringBytes);
    }
    return out;
  }
  return value;
}

function fitMetadata(metadata: Readonly<Record<string, JsonValue>>, maxBytes: number): Record<string, JsonValue> {
  const fitted: Record<string, JsonValue> = {};
  let truncated = false;
  for (const [key, value] of Object.entries(metadata)) {
    const candidateValue = trimMetadataValue(value, 256);
    const next = { ...fitted, [key]: candidateValue };
    const probe = truncated ? { ...next, metadataTruncated: true } : next;
    if (utf8ByteLength(JSON.stringify({ metadata: probe, targets: [] })) <= maxBytes) {
      fitted[key] = candidateValue;
      if (JSON.stringify(candidateValue) !== JSON.stringify(value)) truncated = true;
    } else {
      truncated = true;
    }
  }
  if (truncated) {
    const withFlag = { ...fitted, metadataTruncated: true };
    if (utf8ByteLength(JSON.stringify({ metadata: withFlag, targets: [] })) <= maxBytes) {
      return withFlag;
    }
    return { metadataTruncated: true };
  }
  return fitted;
}

/**
 * Trims `InspectPayload` (`targets` first, then `metadata` if still over budget) so the
 * serialized payload stays within `maxBytes` (default 8 KiB).
 */
export function trimInspectPayload(
  payload: InspectPayload,
  maxBytes = DEFAULT_INSPECT_MAX_BYTES,
): InspectPayload {
  const budget = Math.max(64, Math.floor(maxBytes));
  if (utf8ByteLength(JSON.stringify(payload)) <= budget) return payload;

  let metadata: Readonly<Record<string, JsonValue>> = payload.metadata;
  const baseWithEmptyTargets: InspectPayload = {
    metadata,
    targets: [],
    ...(payload.targets.length > 0 || payload.targetsTruncated ? { targetsTruncated: true } : {}),
  };
  if (utf8ByteLength(JSON.stringify(baseWithEmptyTargets)) > budget) {
    metadata = fitMetadata(metadata, budget);
  }

  let lo = 0;
  let hi = payload.targets.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const targetsTruncated = mid < payload.targets.length || Boolean(payload.targetsTruncated);
    const candidate: InspectPayload = {
      metadata,
      targets: payload.targets.slice(0, mid),
      ...(targetsTruncated ? { targetsTruncated: true } : {}),
    };
    if (utf8ByteLength(JSON.stringify(candidate)) <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const targetsTruncated = lo < payload.targets.length || Boolean(payload.targetsTruncated);
  return {
    metadata,
    targets: payload.targets.slice(0, lo),
    ...(targetsTruncated ? { targetsTruncated: true } : {}),
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
