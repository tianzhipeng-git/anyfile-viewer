import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCalendar } from "./calendar";
import { parseContacts } from "./contacts";
import { decodeText, logicalLines, parseComponentTree, type ContentComponent } from "./parse";

const examples = join(process.cwd(), "examples");
const read = (name: string) => decodeText(new Uint8Array(readFileSync(join(examples, name))));
const tree = (name: string) => parseComponentTree(logicalLines(read(name)));
const component = (name: string, componentName: string): ContentComponent => {
  const found = tree(name).children.find((child) => child.name === componentName);
  if (!found) throw new Error(`${name} has no ${componentName}`);
  return found;
};

describe("iCalendar parsing", () => {
  it("reads events sorted by start, an all-day event and a task", () => {
    const document = parseCalendar(component("team-calendar.ics", "VCALENDAR"));
    expect(document.name).toBe("Anyfile Examples Team Calendar");
    expect(document.timeZone).toBe("Europe/Berlin");
    expect(document.productId).toBe("-//Anyfile Examples//Sample Calendar//EN");
    expect(document.events.map(({ summary }) => summary)).toEqual([
      "Daily standup (Berlin)",
      "Release review; roadmap 2026",
      "Company all-hands",
    ]);

    const [standup, review, allHands] = document.events;
    expect(standup!.start).toMatchObject({ year: 2026, month: 11, day: 23, hour: 9, minute: 30, utc: false, timeZone: "Europe/Berlin" });
    expect(standup!.recurrence).toBe("FREQ=WEEKLY;COUNT=40;BYDAY=MO,TU,WE,TH,FR");
    expect(standup!.alarms).toBe(1);
    expect(standup!.location).toBe("Online");

    expect(review!.start).toMatchObject({ hour: 10, utc: true });
    expect(review!.description).toBe("Agenda:\n1. DjVu reader follow-up\n2. Certificate viewer review\n3. Test budget");
    expect(review!.location).toBe("Room 3.14 / video call");
    expect(review!.organizer).toEqual({ address: "lead@anyfile.invalid" });
    expect(review!.attendees.map(({ address }) => address)).toEqual(["ana@anyfile.invalid", "ben@anyfile.invalid"]);
    expect(review!.categories).toEqual(["team", "review"]);
    expect(review!.status).toBe("CONFIRMED");
    expect(review!.url).toBe("https://anyfile.top/en/view");

    expect(allHands!.start).toMatchObject({ dateOnly: true, day: 4 });
    expect(allHands!.end).toMatchObject({ dateOnly: true, day: 5 });

    expect(document.tasks).toEqual([{
      summary: "Prepare demo files",
      due: { year: 2026, month: 11, day: 27, hour: 17, minute: 0, second: 0, dateOnly: false, utc: true, timeZone: undefined },
      status: "NEEDS-ACTION",
      priority: "2",
      description: undefined,
    }]);
    expect(document.componentCounts).toEqual([{ name: "VEVENT", count: 3 }, { name: "VTODO", count: 1 }]);
  });

  it("keeps floating times without inventing a time zone", () => {
    const document = parseCalendar(component("single-event.ics", "VCALENDAR"));
    expect(document.events).toHaveLength(1);
    expect(document.events[0]).toMatchObject({
      summary: "Lunch with Ana",
      description: "Short lunch; bring notes",
      location: "Canteen",
      start: { hour: 12, minute: 30, utc: false, timeZone: undefined },
    });
  });

  it("tolerates a calendar that ends mid-component", () => {
    const document = parseCalendar(component("truncated-calendar.ics", "VCALENDAR"));
    expect(document.events.length).toBe(1);
    expect(document.events[0]!.summary).toBe("Release review; roadmap 2026");
  });
});

describe("vCard parsing", () => {
  it("reads a generated vCard 3.0 contact", () => {
    const document = parseContacts(tree("contact-single.vcf").children);
    expect(document.version).toBe("3.0");
    expect(document.contacts).toHaveLength(1);
    expect(document.contacts[0]).toMatchObject({
      name: "Mei Lin",
      formattedName: "Mei Lin",
      organization: "Anyfile Examples",
      title: "Maintainer",
      urls: ["https://example.anyfile.invalid/~mei"],
      birthday: undefined,
      hasPhoto: false,
    });
    expect(document.contacts[0]!.emails).toEqual([{ label: undefined, value: "mei@example.anyfile.invalid" }]);
    expect(document.contacts[0]!.phones).toEqual([{ label: undefined, value: "+1 555 0100" }]);
    expect(document.contacts[0]!.addresses[0]).toMatchObject({ street: "1 Example Way", city: "Portland", region: "OR", postalCode: "97201", country: "USA" });
  });

  it("decodes quoted-printable vCard 2.1 cards from a real Android export", () => {
    const document = parseContacts(tree("contacts-android-v21.vcf").children);
    expect(document.version).toBe("2.1");
    expect(document.contacts).toHaveLength(6);
    expect(document.contacts[0]!.emails[0]!.value).toBe("john.doe@company.com");
    expect(document.contacts[0]!.categories).toEqual(["My Contacts"]);
    expect(document.contacts[2]!.formattedName).toBe("Ñ Ñ Ñ Ñ Ñ");
    expect(document.contacts[2]!.phones[0]).toEqual({ label: "CELL, PREF", value: "123456789" });
    expect(document.contacts.some(({ hasPhoto }) => hasPhoto)).toBe(true);
  });

  it("reads a real Outlook 2.1 card with a folded Base64 photo", () => {
    const document = parseContacts(tree("contact-outlook-v21.vcf").children);
    const [contact] = document.contacts;
    expect(contact!.formattedName).toBe("Mr. John Richter James Doe Sr.");
    expect(contact!.organization).toBe("IBM");
    expect(contact!.title).toBe("Money Counter");
    expect(contact!.phones).toEqual([
      { label: "WORK, VOICE", value: "(905) 555-1234" },
      { label: "HOME, VOICE", value: "(905) 666-1234" },
    ]);
    expect(contact!.emails).toEqual([{ label: "INTERNET, PREF", value: "john.doe@ibm.cm" }]);
    expect(contact!.addresses).toHaveLength(2);
    expect(contact!.addresses[0]!.street).toBe("Cresent moon drive");
    expect(contact!.hasPhoto).toBe(true);
    expect(contact!.note?.startsWith("THIS SOFTWARE IS PROVIDED BY")).toBe(true);
    expect(contact!.birthday).toBe("19800322");
  });

  it("keeps a card that is missing its END line", () => {
    const document = parseContacts(tree("truncated-contacts.vcf").children);
    expect(document.contacts).toHaveLength(1);
    expect(document.contacts[0]!.formattedName).toBe("Mei Lin");
  });
});
