import { decodeValue, propertiesOf, propertyOf, splitEscaped, textOf, type ContentComponent, type ContentLine } from "./parse";
import type {
  CalendarDocument,
  CalendarEvent,
  CalendarMoment,
  CalendarPerson,
  CalendarTask,
} from "./types";

const MAX_EVENTS = 5000;
const MAX_TASKS = 2000;

export function momentOrder(moment: CalendarMoment): number {
  return Date.UTC(moment.year, moment.month - 1, moment.day, moment.hour, moment.minute, moment.second);
}

function readMoment(line: ContentLine | undefined): CalendarMoment | undefined {
  if (!line) return undefined;
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(line.value.trim());
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return undefined;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateOnly: match[4] === undefined,
    utc: match[7] === "Z",
    timeZone: line.params.TZID?.[0],
  };
}

function readPerson(line: ContentLine): CalendarPerson {
  const value = decodeValue(line).trim();
  const address = value.replace(/^mailto:/i, "");
  return {
    address,
    name: line.params.CN?.[0],
    role: line.params.ROLE?.[0],
    status: line.params.PARTSTAT?.[0],
  };
}

function readCategories(component: ContentComponent): string[] {
  const line = propertyOf(component, "CATEGORIES");
  if (!line) return [];
  return splitEscaped(decodeValue(line), ",").map((item) => item.trim()).filter(Boolean).slice(0, 32);
}

function readEvent(component: ContentComponent): CalendarEvent {
  const organizer = propertyOf(component, "ORGANIZER");
  const description = textOf(component, "DESCRIPTION");
  return {
    uid: textOf(component, "UID"),
    summary: textOf(component, "SUMMARY") ?? "",
    description: description && description.length > 4000 ? `${description.slice(0, 4000)}…` : description,
    location: textOf(component, "LOCATION"),
    start: readMoment(propertyOf(component, "DTSTART")),
    end: readMoment(propertyOf(component, "DTEND")),
    duration: propertyOf(component, "DURATION") ? textOf(component, "DURATION") : undefined,
    organizer: organizer ? readPerson(organizer) : undefined,
    attendees: propertiesOf(component, "ATTENDEE").slice(0, 100).map(readPerson),
    status: textOf(component, "STATUS"),
    categories: readCategories(component),
    url: textOf(component, "URL"),
    recurrence: propertyOf(component, "RRULE") ? decodeValue(propertyOf(component, "RRULE")!).trim() : undefined,
    classification: textOf(component, "CLASS"),
    alarms: component.children.filter(({ name }) => name === "VALARM").length,
    created: readMoment(propertyOf(component, "CREATED")),
    lastModified: readMoment(propertyOf(component, "LAST-MODIFIED")),
  };
}

function readTask(component: ContentComponent): CalendarTask {
  const description = textOf(component, "DESCRIPTION");
  return {
    summary: textOf(component, "SUMMARY") ?? "",
    due: readMoment(propertyOf(component, "DUE", "DTSTART")),
    status: textOf(component, "STATUS"),
    priority: textOf(component, "PRIORITY"),
    description: description && description.length > 1000 ? `${description.slice(0, 1000)}…` : description,
  };
}

function countComponents(components: readonly ContentComponent[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { name } of components) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function parseCalendar(calendar: ContentComponent): CalendarDocument {
  const events = calendar.children
    .filter(({ name }) => name === "VEVENT")
    .slice(0, MAX_EVENTS)
    .map(readEvent)
    .sort((a, b) => {
      const left = a.start ? momentOrder(a.start) : Number.POSITIVE_INFINITY;
      const right = b.start ? momentOrder(b.start) : Number.POSITIVE_INFINITY;
      return left - right || a.summary.localeCompare(b.summary);
    });
  const tasks = calendar.children
    .filter(({ name }) => name === "VTODO")
    .slice(0, MAX_TASKS)
    .map(readTask);
  return {
    kind: "calendar",
    name: textOf(calendar, "X-WR-CALNAME") ?? textOf(calendar, "NAME"),
    timeZone: textOf(calendar, "X-WR-TIMEZONE"),
    productId: textOf(calendar, "PRODID"),
    version: textOf(calendar, "VERSION"),
    method: textOf(calendar, "METHOD"),
    events,
    tasks,
    componentCounts: countComponents(calendar.children),
  };
}
