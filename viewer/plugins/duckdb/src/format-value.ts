export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Uint8Array) {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
