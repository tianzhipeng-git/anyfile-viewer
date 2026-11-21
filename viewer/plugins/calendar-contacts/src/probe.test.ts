import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";

import { inspectCalendarContacts } from "./probe";

const examples = join(process.cwd(), "examples");
const read = (name: string) => new Uint8Array(readFileSync(join(examples, name)));

function context(name: string) {
  return { file: new File([read(name)], name), signal: new AbortController().signal };
}

describe("calendar and contacts probe", () => {
  it("recognizes real iCalendar and vCard files", async () => {
    await expect(inspectCalendarContacts(context("team-calendar.ics"))).resolves.toBe(4);
    await expect(inspectCalendarContacts(context("single-event.ics"))).resolves.toBe(4);
    await expect(inspectCalendarContacts(context("contact-single.vcf"))).resolves.toBe(4);
    await expect(inspectCalendarContacts(context("contacts-android-v21.vcf"))).resolves.toBe(4);
  });

  it("rejects disguised text and truncated headers", async () => {
    await expect(inspectCalendarContacts(context("disguised-text.vcf"))).resolves.toBe(0);
    await expect(inspectCalendarContacts({ file: new File(["BEGIN:VCALENDAR"], "short.ics"), signal: new AbortController().signal }))
      .resolves.toBe(0);
  });

  it("reads only a bounded header", async () => {
    const { file, reads } = createTrackedFile(read("team-calendar.ics"), "calendar.ics");
    await inspectCalendarContacts({ file, signal: new AbortController().signal });
    expect(reads.length).toBe(1);
    assertReadsWithin(reads, [{ start: 0, end: 16 * 1024 }]);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(inspectCalendarContacts({ file: new File([read("single-event.ics")], "event.ics"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
