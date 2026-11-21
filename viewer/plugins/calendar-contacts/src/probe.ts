import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { decodeText, logicalLines } from "./parse";

/** 16 KiB is enough for the header block and the first components of a real calendar. */
const PROBE_BYTES = 16 * 1024;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

export async function inspectCalendarContacts({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("__anyfile_calendar_contacts_probe_v1__: aborted", "AbortError");
  if (file.size < 24 || file.size > MAX_FILE_BYTES) return 0;
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, Math.min(file.size, PROBE_BYTES)).arrayBuffer());
  } catch {
    if (signal.aborted) throw new DOMException("__anyfile_calendar_contacts_probe_v1__: aborted", "AbortError");
    return 0;
  }
  if (signal.aborted) throw new DOMException("__anyfile_calendar_contacts_probe_v1__: aborted", "AbortError");
  const lines = logicalLines(decodeText(head));
  return lines.some((line) => /^BEGIN:(VCALENDAR|VCARD)$/i.test(line.trim())) ? 4 : 0;
}
