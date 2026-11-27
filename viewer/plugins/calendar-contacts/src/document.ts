import { ViewerError } from "@anyfile/viewer-protocol";

import { parseCalendar } from "./calendar";
import { parseContacts } from "./contacts";
import { logicalLines, parseComponentTree } from "./parse";
import type { MailDocument } from "./types";

/** Large shared calendars stay well below this cap; the whole text is parsed in memory. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

/** DOM-free iCalendar / vCard parse shared by the browser viewer and the Node `./extract`. */
export function parseDocument(text: string, invalid: string): MailDocument {
  const root = parseComponentTree(logicalLines(text));
  const calendar = root.children.find(({ name }) => name === "VCALENDAR");
  if (calendar) return parseCalendar(calendar);
  const cards = root.children.filter(({ name }) => name === "VCARD");
  if (cards.length > 0) return parseContacts(cards);
  throw new ViewerError("invalid-file", invalid);
}
