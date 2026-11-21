import {
  ViewerError,
  selectMessages,
  type FileViewerPlugin,
  type OpenViewerContext,
  type ViewerController,
} from "@anyfile/viewer-protocol";

import { createCalendarView } from "./calendar-view";
import { parseCalendar } from "./calendar";
import { parseContacts } from "./contacts";
import { createContactsView } from "./contacts-view";
import { calendarContactsManifest } from "./manifest";
import { decodeText, logicalLines, parseComponentTree } from "./parse";
import { inspectCalendarContacts } from "./probe";
import type { MailDocument } from "./types";

/** Large shared calendars stay well below this cap; the whole text is parsed in memory. */
const MAX_FILE_BYTES = 32 * 1024 * 1024;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function parseDocument(text: string, invalid: string): MailDocument {
  const root = parseComponentTree(logicalLines(text));
  const calendar = root.children.find(({ name }) => name === "VCALENDAR");
  if (calendar) return parseCalendar(calendar);
  const cards = root.children.filter(({ name }) => name === "VCARD");
  if (cards.length > 0) return parseContacts(cards);
  throw new ViewerError("invalid-file", invalid);
}

async function openCalendarContacts(context: OpenViewerContext): Promise<ViewerController> {
  const { container, file, locale, reportProgress, reportPreview, signal } = context;
  const copy = selectMessages(locale, {
    en: {
      reading: "Reading file…",
      parsing: "Parsing calendar and contacts…",
      rendering: "Building the list…",
      ready: "File opened",
      invalid: "The file is damaged or is not an iCalendar or vCard file.",
      tooLarge: "This file is larger than the 32 MiB limit.",
    },
    "zh-CN": {
      reading: "正在读取文件…",
      parsing: "正在解析日历与联系人…",
      rendering: "正在生成列表…",
      ready: "文件已打开",
      invalid: "文件已损坏，或不是 iCalendar / vCard 文件。",
      tooLarge: "该文件超过 32 MiB 的查看上限。",
    },
  });
  let view: { readonly root: HTMLElement; dispose(): void } | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    view?.dispose();
  };

  try {
    if (file.size > MAX_FILE_BYTES) throw new ViewerError("resource-limit", copy.tooLarge);
    if (!await inspectCalendarContacts(context)) throw new ViewerError("invalid-file", copy.invalid);

    reportProgress({ stage: "reading", message: copy.reading, loaded: 0, total: file.size });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "parsing", message: copy.parsing });
    const document = parseDocument(decodeText(bytes), copy.invalid);
    if (signal.aborted) throw abortError();

    reportProgress({ stage: "rendering", message: copy.rendering });
    const shared = { fileName: file.name, fileSize: file.size, locale };
    view = document.kind === "calendar"
      ? createCalendarView({ ...shared, document })
      : createContactsView({ ...shared, document });
    container.append(view.root);
    signal.addEventListener("abort", dispose, { once: true });
    reportProgress({ stage: "ready", message: copy.ready });
    reportPreview?.({ outcome: "success", kind: "structure" });
    return { dispose };
  } catch (error) {
    dispose();
    if (error instanceof ViewerError || isAbortError(error)) throw error;
    throw new ViewerError("invalid-file", copy.invalid, { cause: error });
  }
}

export const calendarContactsViewer: FileViewerPlugin = { manifest: calendarContactsManifest, open: openCalendarContacts };
export { calendarContactsManifest } from "./manifest";
