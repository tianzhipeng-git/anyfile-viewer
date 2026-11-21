import type { Locale } from "@anyfile/viewer-protocol";

import type { CalendarDocument, CalendarEvent, CalendarTask } from "./types";
import { copyFor, filterMatches, formatDate, formatMoment, node, sameDay, styles, timeOf, type MailCopy } from "./ui";

const MAX_EVENT_ROWS = 800;
const MAX_TASK_ROWS = 200;

export interface MailView {
  readonly root: HTMLElement;
  dispose(): void;
}

function metaText(document: CalendarDocument, fileSize: number, copy: MailCopy, locale: Locale) {
  const parts = [
    copy.calendar,
    `${document.events.length} ${copy.events}`,
    document.tasks.length ? `${document.tasks.length} ${copy.tasks}` : undefined,
    document.timeZone,
    `${copy.fileSize}: ${fileSize.toLocaleString(locale)} B`,
  ];
  return parts.filter(Boolean).join(" · ");
}

function whenText(event: CalendarEvent, copy: MailCopy, locale: Locale): { date: string; time: string } {
  if (!event.start) return { date: copy.unscheduled, time: "" };
  const date = formatDate(event.start, locale);
  if (event.start.dateOnly) return { date, time: copy.allDay };
  const time = event.end
    ? sameDay(event.start, event.end)
      ? `${timeOf(event.start, locale)} – ${timeOf(event.end, locale)}`
      : `${timeOf(event.start, locale)} – ${formatMoment(event.end, locale)}`
    : timeOf(event.start, locale);
  const zone = event.start.utc ? "UTC" : event.start.timeZone;
  return { date, time: zone ? `${time} · ${zone}` : time };
}

function panelRow(panel: HTMLElement, label: string, value: string | undefined, list: readonly string[] = []) {
  if (!value && list.length === 0) return;
  panel.append(node("dt", undefined, label), node("dd", undefined, value ?? list.join("\n")));
}

function eventRow(event: CalendarEvent, copy: MailCopy, locale: Locale) {
  const row = node("div", "anyfile-calendar-contacts__event");
  const when = whenText(event, copy, locale);
  const whenCell = node("div", "anyfile-calendar-contacts__when");
  whenCell.append(node("span", undefined, when.date));
  if (when.time) whenCell.append(node("br"), node("span", undefined, when.time));
  const body = node("div", "anyfile-calendar-contacts__body");
  body.append(node("h3", "anyfile-calendar-contacts__summary", event.summary || copy.noTitle));

  if (event.location) body.append(node("p", "anyfile-calendar-contacts__line anyfile-calendar-contacts__muted", event.location));

  const chips = node("div", "anyfile-calendar-contacts__chips");
  const addChip = (text: string | undefined) => {
    if (text) chips.append(node("span", "anyfile-calendar-contacts__chip", text));
  };
  addChip(event.status);
  addChip(event.classification);
  for (const category of event.categories.slice(0, 3)) addChip(category);
  if (event.recurrence) addChip(copy.recurrence);
  if (event.alarms > 0) addChip(`${copy.alarms}: ${event.alarms}`);
  if (event.attendees.length > 0) addChip(`${copy.attendees}: ${event.attendees.length}`);
  if (chips.childElementCount > 0) body.append(chips);

  const hasDetails = Boolean(event.description || event.organizer || event.attendees.length > 0 || event.recurrence || event.url);
  if (hasDetails) {
    const details = node("details", "anyfile-calendar-contacts__details");
    details.append(node("summary", undefined, copy.details));
    const panel = node("dl", "anyfile-calendar-contacts__panel");
    panelRow(panel, copy.description, event.description);
    panelRow(panel, copy.organizer, event.organizer ? event.organizer.name ?? event.organizer.address : undefined);
    panelRow(panel, copy.attendees, undefined, event.attendees.map((person) => person.name ?? person.address).slice(0, 50));
    panelRow(panel, copy.recurrence, event.recurrence);
    panelRow(panel, copy.link, event.url);
    details.append(panel);
    body.append(details);
  }

  row.append(whenCell, body);
  row.dataset.search = [
    event.summary, event.location, event.description, event.categories.join(" "), event.status,
    event.organizer?.name, event.organizer?.address, ...event.attendees.map((person) => person.name ?? person.address),
  ].filter(Boolean).join(" ").toLowerCase();
  return row;
}

function taskRow(task: CalendarTask, copy: MailCopy, locale: Locale) {
  const row = node("div", "anyfile-calendar-contacts__event");
  const whenCell = node("div", "anyfile-calendar-contacts__when");
  if (task.due) {
    whenCell.append(node("span", undefined, formatDate(task.due, locale)));
    if (!task.due.dateOnly) whenCell.append(node("br"), node("span", undefined, timeOf(task.due, locale)));
  } else whenCell.append(node("span", undefined, copy.due));
  const body = node("div", "anyfile-calendar-contacts__body");
  body.append(node("h3", "anyfile-calendar-contacts__summary", task.summary || copy.tasks));
  const chips = node("div", "anyfile-calendar-contacts__chips");
  if (task.status) chips.append(node("span", "anyfile-calendar-contacts__chip", task.status));
  if (task.priority) chips.append(node("span", "anyfile-calendar-contacts__chip", `P${task.priority}`));
  if (chips.childElementCount > 0) body.append(chips);
  if (task.description) {
    const details = node("details", "anyfile-calendar-contacts__details");
    details.append(node("summary", undefined, copy.details));
    const panel = node("dl", "anyfile-calendar-contacts__panel");
    panelRow(panel, copy.description, task.description);
    details.append(panel);
    body.append(details);
  }
  row.append(whenCell, body);
  row.dataset.search = [task.summary, task.description, task.status].filter(Boolean).join(" ").toLowerCase();
  return row;
}

export function createCalendarView(options: {
  document: CalendarDocument;
  fileName: string;
  fileSize: number;
  locale: Locale;
}): MailView {
  const { document, fileName, fileSize, locale } = options;
  const copy = copyFor(locale);
  const root = node("div", "anyfile-calendar-contacts");
  const header = node("div", "anyfile-calendar-contacts__header");
  header.append(
    node("span", "anyfile-calendar-contacts__title", document.name || fileName),
    node("span", "anyfile-calendar-contacts__meta", metaText(document, fileSize, copy, locale)),
  );
  const toolbar = node("div", "anyfile-calendar-contacts__toolbar");
  const search = node("input", "anyfile-calendar-contacts__search");
  search.type = "search";
  search.placeholder = copy.searchCalendar;
  search.setAttribute("aria-label", copy.searchCalendar);
  const count = node("span", "anyfile-calendar-contacts__count");
  toolbar.append(search, count);

  const viewport = node("div", "anyfile-calendar-contacts__viewport");
  const empty = node("p", "anyfile-calendar-contacts__empty", document.events.length === 0 ? copy.noEvents : copy.noMatch);
  empty.hidden = true;

  const rows = document.events.slice(0, MAX_EVENT_ROWS).map((event) => eventRow(event, copy, locale));
  viewport.append(...rows);
  if (document.events.length > MAX_EVENT_ROWS) {
    viewport.append(node("p", "anyfile-calendar-contacts__empty", `+ ${document.events.length - MAX_EVENT_ROWS}`));
  }
  const taskRows: HTMLElement[] = [];
  if (document.tasks.length > 0) {
    viewport.append(node("h2", "anyfile-calendar-contacts__section-title", copy.tasks));
    taskRows.push(...document.tasks.slice(0, MAX_TASK_ROWS).map((task) => taskRow(task, copy, locale)));
    viewport.append(...taskRows);
  }
  viewport.append(empty);

  const visible = () => [...rows, ...taskRows].filter((row) => !row.hidden).length;
  const update = () => {
    const query = search.value;
    for (const row of [...rows, ...taskRows]) row.hidden = !filterMatches(query, [row.dataset.search]);
    const shown = visible();
    count.textContent = `${shown} / ${rows.length + taskRows.length}`;
    empty.textContent = rows.length + taskRows.length === 0 ? copy.noEvents : copy.noMatch;
    empty.hidden = shown > 0;
  };
  const onInput = () => update();
  search.addEventListener("input", onInput);
  update();

  root.append(styles(), header, toolbar, viewport);
  return {
    root,
    dispose() {
      search.removeEventListener("input", onInput);
      root.remove();
    },
  };
}
