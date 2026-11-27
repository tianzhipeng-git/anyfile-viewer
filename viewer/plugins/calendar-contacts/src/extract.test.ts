// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };
const fixture = (name: string, extra: object = {}) => ({ name, filePath: resolve(EXAMPLES, name), ...extra });

function context(name: string): ExtractContext {
  const bytes = new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

describe("calendar-contacts ./extract", () => {
  it("passes extractor compliance on iCalendar and vCard samples", async () => {
    const invalidBytes = readFileSync(resolve(EXAMPLES, "disguised-text.vcf"));
    await assertExtractorCompliance(extractor, [
      fixture("team-calendar.ics", { invalidBytes, filter: "review", smallMaxBytes: 200 }),
      fixture("single-event.ics"),
      fixture("truncated-calendar.ics"),
      fixture("contacts-android-v21.vcf", { invalidBytes, filter: "doe" }),
      fixture("contact-outlook-v21.vcf", { smallMaxBytes: 120 }),
      fixture("truncated-contacts.vcf"),
    ]);
  });

  it("reports calendar metadata and renders events with time zones", async () => {
    const inspected = await extractor.inspect(context("team-calendar.ics"));
    expect(inspected.metadata).toMatchObject({
      kind: "calendar",
      name: "Anyfile Examples Team Calendar",
      timeZone: "Europe/Berlin",
      eventCount: 3,
      taskCount: 1,
    });
    expect(inspected.targets.map(({ id }) => id)).toEqual(["events", "tasks"]);

    const events = await extractor.read(context("team-calendar.ics"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(events.content).toContain("### Release review; roadmap 2026");
    expect(events.content).toContain("- **Start**: 2026-11-23 09:30 (Europe/Berlin)");
    expect(events.content).toContain("- **Recurrence**: FREQ=WEEKLY;COUNT=40;BYDAY=MO,TU,WE,TH,FR");

    const filtered = await extractor.read(context("team-calendar.ics"), { filter: "main hall", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(filtered).toMatchObject({ filterApplied: true, truncated: false });
    expect(filtered.content.startsWith("### Company all-hands")).toBe(true);
    expect(filtered.content).not.toContain("Release review");
  });

  it("renders contacts without embedding photo data", async () => {
    const inspected = await extractor.inspect(context("contacts-android-v21.vcf"));
    expect(inspected.metadata).toMatchObject({ kind: "contacts", version: "2.1", contactCount: 6 });
    const outlook = await extractor.read(context("contact-outlook-v21.vcf"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(outlook.content).toContain("- **Photo**: embedded (not shown)");
    expect(outlook.content.length).toBeLessThan(2000);
    await expect(
      extractor.read(context("contact-single.vcf"), { target: "events", maxBytes: DEFAULT_READ_MAX_BYTES }),
    ).rejects.toMatchObject({ code: "target-not-found" });
  });
});
