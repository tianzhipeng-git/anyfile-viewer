import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createViewerTestContext } from "@anyfile/viewer-test";

import { calendarContactsViewer } from "./index";

const examples = join(process.cwd(), "examples");
const sample = (name: string) => new File([readFileSync(join(examples, name))], name);

describe("calendar and contacts viewer", () => {
  it("opens a calendar and filters events", async () => {
    const test = createViewerTestContext(sample("team-calendar.ics"));
    const controller = await calendarContactsViewer.open(test.context);
    expect(test.container.textContent).toContain("Anyfile Examples Team Calendar");
    expect(test.container.textContent).toContain("Release review; roadmap 2026");
    expect(test.container.textContent).toContain("Main hall");
    expect(test.container.textContent).toContain("任务");
    expect(test.container.querySelectorAll(".anyfile-calendar-contacts__event")).toHaveLength(4);
    const firstWhen = test.container.querySelector<HTMLElement>(".anyfile-calendar-contacts__when")!;
    expect(firstWhen.textContent).toContain("09:30 – 09:45");
    expect(firstWhen.textContent).not.toContain("00:00");

    const search = test.container.querySelector<HTMLInputElement>(".anyfile-calendar-contacts__search")!;
    search.value = "standup";
    search.dispatchEvent(new Event("input"));
    const visibleRows = [...test.container.querySelectorAll<HTMLElement>(".anyfile-calendar-contacts__event")]
      .filter((row) => !row.hidden);
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0]!.textContent).toContain("Daily standup (Berlin)");
    expect(test.container.querySelector(".anyfile-calendar-contacts__count")!.textContent).toBe("1 / 4");

    search.value = "no such event";
    search.dispatchEvent(new Event("input"));
    expect(test.container.querySelector<HTMLElement>(".anyfile-calendar-contacts__empty")!.hidden).toBe(false);

    controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
    controller.dispose();
    test.cleanup();
  });

  it("opens contacts and filters cards", async () => {
    const test = createViewerTestContext(sample("contacts-android-v21.vcf"));
    const controller = await calendarContactsViewer.open(test.context);
    expect(test.container.querySelectorAll(".anyfile-calendar-contacts__card")).toHaveLength(6);
    expect(test.container.textContent).toContain("john.doe@company.com");

    const search = test.container.querySelector<HTMLInputElement>(".anyfile-calendar-contacts__search")!;
    search.value = "henry";
    search.dispatchEvent(new Event("input"));
    const visibleCards = [...test.container.querySelectorAll<HTMLElement>(".anyfile-calendar-contacts__card")]
      .filter((card) => !card.hidden);
    expect(visibleCards).toHaveLength(1);
    expect(visibleCards[0]!.textContent).toContain("henry@company.com");

    controller.dispose();
    test.cleanup();
  });

  it("opens a real Outlook contact with many fields", async () => {
    const test = createViewerTestContext(sample("contact-outlook-v21.vcf"));
    const controller = await calendarContactsViewer.open(test.context);
    expect(test.container.textContent).toContain("Mr. John Richter James Doe Sr.");
    expect(test.container.textContent).toContain("IBM");
    expect(test.container.textContent).toContain("(905) 555-1234");
    expect(test.container.textContent).toContain("Cresent moon drive, Albaney, New York, 12345");
    controller.dispose();
    test.cleanup();
  });

  it("rejects a file without a calendar or card", async () => {
    const test = createViewerTestContext(sample("disguised-text.vcf"));
    await expect(calendarContactsViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(test.container.childElementCount).toBe(0);
    test.cleanup();
  });

  it("enforces the input limit before reading", async () => {
    const file = sample("team-calendar.ics");
    Object.defineProperty(file, "size", { value: 33 * 1024 * 1024 });
    const test = createViewerTestContext(file);
    await expect(calendarContactsViewer.open(test.context)).rejects.toMatchObject({ code: "resource-limit" });
    expect(test.container.childElementCount).toBe(0);
    test.cleanup();
  });

  it("cancels while opening and while active", async () => {
    const opening = createViewerTestContext(sample("team-calendar.ics"));
    opening.abortController.abort();
    await expect(calendarContactsViewer.open(opening.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(opening.container.childElementCount).toBe(0);
    opening.cleanup();

    const active = createViewerTestContext(sample("contact-single.vcf"));
    const controller = await calendarContactsViewer.open(active.context);
    expect(active.container.childElementCount).toBe(1);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
    await controller.dispose();
    expect(active.container.childElementCount).toBe(0);
    active.cleanup();
  });
});
