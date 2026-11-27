import {
  AgentError,
  ViewerError,
  abortError,
  isViewerAbortError,
  paginateLines,
  readBlob,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

import { MAX_FILE_BYTES, parseDocument } from "./document";
import { decodeText } from "./parse";
import type { CalendarEvent, CalendarMoment, CalendarPerson, CalendarTask, Contact, MailDocument } from "./types";

const PLUGIN_ID = "calendar-contacts";

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

function moment(value: CalendarMoment | undefined): string | undefined {
  if (!value) return undefined;
  const date = `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}`;
  if (value.dateOnly) return date;
  const time = `${pad(value.hour)}:${pad(value.minute)}${value.second ? `:${pad(value.second)}` : ""}`;
  return `${date} ${time} ${value.utc ? "UTC" : value.timeZone ? `(${value.timeZone})` : "(floating)"}`;
}

function person(value: CalendarPerson): string {
  const extra = [value.role, value.status].filter(Boolean).join(", ");
  return `${value.name ? `${value.name} <${value.address}>` : value.address}${extra ? ` (${extra})` : ""}`;
}

/** One Markdown block per item; paging counts whole items. */
function block(title: string, rows: readonly (readonly [string, string | undefined])[]): string {
  const lines = [`### ${title}`];
  for (const [name, value] of rows) {
    if (value) lines.push(`- **${name}**: ${value.replace(/\r?\n/g, "\n  ")}`);
  }
  return lines.join("\n");
}

function eventBlock(event: CalendarEvent): string {
  return block(event.summary || "(untitled event)", [
    ["Start", moment(event.start)],
    ["End", moment(event.end)],
    ["Duration", event.duration],
    ["Location", event.location],
    ["Status", event.status],
    ["Recurrence", event.recurrence],
    ["Organizer", event.organizer ? person(event.organizer) : undefined],
    ["Attendees", event.attendees.map(person).join("; ")],
    ["Categories", event.categories.join(", ")],
    ["Class", event.classification],
    ["Alarms", event.alarms ? String(event.alarms) : undefined],
    ["URL", event.url],
    ["UID", event.uid],
    ["Description", event.description],
  ]);
}

function taskBlock(task: CalendarTask): string {
  return block(task.summary || "(untitled task)", [
    ["Due", moment(task.due)],
    ["Status", task.status],
    ["Priority", task.priority],
    ["Description", task.description],
  ]);
}

function contactBlock(contact: Contact): string {
  const fields = (items: readonly { label?: string; value: string }[]) =>
    items.map(({ label, value }) => (label ? `${value} (${label})` : value)).join("; ");
  return block(contact.name || "(unnamed contact)", [
    ["Organization", contact.organization],
    ["Title", contact.title],
    ["Nickname", contact.nickname],
    ["Phones", fields(contact.phones)],
    ["Emails", fields(contact.emails)],
    ["Addresses", contact.addresses.map((address) => {
      const text = [address.street, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(", ");
      return address.label ? `${text} (${address.label})` : text;
    }).join("; ")],
    ["URLs", contact.urls.join("; ")],
    ["Birthday", contact.birthday],
    ["Categories", contact.categories.join(", ")],
    ["Photo", contact.hasPhoto ? "embedded (not shown)" : undefined],
    ["Note", contact.note],
  ]);
}

async function load(context: ExtractContext): Promise<MailDocument> {
  if (context.signal.aborted) throw abortError();
  if (context.file.size > MAX_FILE_BYTES) {
    throw new AgentError("resource-limit", "The file is larger than the 32 MiB limit.", { pluginId: PLUGIN_ID });
  }
  try {
    const bytes = await readBlob(context.file, context.signal);
    return parseDocument(decodeText(bytes), "No VCALENDAR or VCARD component found.");
  } catch (error) {
    if (isViewerAbortError(error)) throw error;
    throw new AgentError(
      "invalid-file",
      error instanceof ViewerError ? error.message : "The file is damaged or is not an iCalendar or vCard file.",
      { pluginId: PLUGIN_ID, cause: error },
    );
  }
}

function blocksFor(document: MailDocument, target: string): string[] | undefined {
  if (document.kind === "contacts") return target === "contacts" ? document.contacts.map(contactBlock) : undefined;
  if (target === "events") return document.events.map(eventBlock);
  if (target === "tasks" && document.tasks.length > 0) return document.tasks.map(taskBlock);
  return undefined;
}

const calendarContactsExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const document = await load(context);
    if (document.kind === "contacts") {
      return {
        metadata: { kind: "contacts", version: document.version ?? null, contactCount: document.contacts.length, sizeBytes: context.source.size },
        targets: [{ id: "contacts", title: "Contacts", kind: "list", size: document.contacts.length }],
      };
    }
    const starts = document.events.flatMap(({ start }) => (start ? [moment(start)!] : []));
    const targets: TargetEntry[] = [{ id: "events", title: "Events", kind: "list", size: document.events.length }];
    if (document.tasks.length > 0) targets.push({ id: "tasks", title: "Tasks", kind: "list", size: document.tasks.length });
    return {
      metadata: {
        kind: "calendar",
        name: document.name ?? null,
        timeZone: document.timeZone ?? null,
        productId: document.productId ?? null,
        version: document.version ?? null,
        method: document.method ?? null,
        eventCount: document.events.length,
        taskCount: document.tasks.length,
        ...(starts.length ? { firstEventStart: starts[0], lastEventStart: starts[starts.length - 1] } : {}),
        components: Object.fromEntries(document.componentCounts.map(({ name, count }) => [name, count])),
        sizeBytes: context.source.size,
      },
      targets,
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const document = await load(context);
    const target = params.target ?? (document.kind === "contacts" ? "contacts" : "events");
    let blocks = blocksFor(document, target);
    if (!blocks) throw new AgentError("target-not-found", `Target not found: "${target}".`, { pluginId: PLUGIN_ID });
    const needle = params.filter?.trim().toLowerCase();
    if (needle) blocks = blocks.filter((item) => item.toLowerCase().includes(needle));
    // Blank line between items keeps the Markdown blocks apart; paging still counts whole items.
    const page = paginateLines(blocks.map((item, index) => (index > 0 ? `\n${item}` : item)), params.cursor, params.maxBytes, PLUGIN_ID);
    return {
      content: page.content.replace(/^\n/, ""),
      contentType: "markdown",
      truncated: page.truncated,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      ...(needle ? { filterApplied: true } : {}),
    };
  },
};

export default calendarContactsExtractor;
