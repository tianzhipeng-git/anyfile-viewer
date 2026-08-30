export function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}
