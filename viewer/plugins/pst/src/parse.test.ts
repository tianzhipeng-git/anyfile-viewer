import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertReadsWithin, createTrackedFile, truncated } from "@anyfile/viewer-test";

import { sanitizeEmailHtml } from "./html";
import { PstArchive, type FolderInfo } from "./messaging";
import { PST_PROBE_BYTES, probePst } from "./probe";
import { decompressRtf, rtfToBody } from "./rtf";

const sample = new Uint8Array(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../examples/dist-list.pst")));
const signal = new AbortController().signal;

function withByte(bytes: Uint8Array, offset: number, value: number) {
  const copy = bytes.slice();
  copy[offset] = value;
  return copy;
}

async function childNamed(archive: PstArchive, parent: number, name: string): Promise<FolderInfo> {
  const folder = (await archive.subfolders(parent)).find((child) => child.name === name);
  expect(folder, name).toBeDefined();
  return folder!;
}

describe("PST probe", () => {
  it("reads only the fixed header and recognises the archive", async () => {
    const { file, reads } = createTrackedFile(sample, "mailbox.pst");
    expect(await probePst({ file, signal })).toBe(3);
    assertReadsWithin(reads, [{ start: 0, end: PST_PROBE_BYTES }]);
  });

  it("rejects non-PST data and cyclic-encrypted archives", async () => {
    expect(await probePst({ file: new File([new Uint8Array(1024)], "fake.pst"), signal })).toBe(0);
    expect(await probePst({ file: new File([truncated(sample, 100) as BlobPart], "short.pst"), signal })).toBe(0);
    expect(await probePst({ file: new File([withByte(sample, 513, 2)], "cyclic.pst"), signal })).toBe(0);
  });
});

describe("PST archive reader", () => {
  it("walks the folder tree, contents tables and message properties of a real archive", async () => {
    const archive = await PstArchive.open(new File([sample], "dist-list.pst"));
    expect(archive.storeName).toBe("Personal Folders");
    expect(archive.ndb.header).toMatchObject({ format: "unicode", isOst: false, cryptMethod: 1 });

    const top = await archive.subfolders(archive.rootFolder.nid);
    const personal = await childNamed(archive, archive.rootFolder.nid, "Top of Personal Folders");
    const children = await archive.subfolders(personal.nid);
    expect(children.map(({ name }) => name)).toEqual(expect.arrayContaining(["Inbox", "Sent Items", "Calendar", "Contacts", "Deleted Items"]));

    const contacts = await childNamed(archive, personal.nid, "Contacts");
    const contactList = await archive.contents(contacts.nid);
    expect(contactList.count).toBe(2);
    expect((await contactList.page(0, 10)).map(({ subject, messageClass }) => [subject, messageClass]))
      .toEqual([["contact name 1", "IPM.Contact"], ["test dist list", "IPM.DistList"]]);

    const calendar = await childNamed(archive, personal.nid, "Calendar");
    expect(calendar).toMatchObject({ contentCount: 1, containerClass: "IPF.Appointment" });
    const [appointment] = await (await archive.contents(calendar.nid)).page(0, 10);
    expect(appointment).toMatchObject({ subject: "Test appointment", messageClass: "IPM.Appointment", hasAttachments: true });
    expect(appointment.date?.toISOString()).toBe("2016-08-02T00:27:12.621Z");

    const detail = await archive.message(appointment.nid);
    expect(detail.text).toBe("This is a complete test\r\n");
    expect(detail.attachments).toHaveLength(2);
    expect(detail.attachments.every(({ embeddedMessage }) => embeddedMessage)).toBe(true);
    expect(rtfToBody(decompressRtf(detail.rtf!))).toEqual({ kind: "text", content: "This is a complete test" });

    expect(await archive.defaultFolderPath(top)).toEqual([personal.nid, calendar.nid]);
  });

  it("rejects truncated archives and unsupported encryption", async () => {
    await expect(PstArchive.open(new File([truncated(sample, 4096) as BlobPart], "cut.pst"))).rejects.toMatchObject({ code: "invalid-file" });
    await expect(PstArchive.open(new File([withByte(sample, 513, 2)], "cyclic.pst"))).rejects.toMatchObject({ code: "unsupported" });
    await expect(PstArchive.open(new File(["not a mailbox"], "fake.pst"))).rejects.toMatchObject({ code: "invalid-file" });
  });

  it.runIf(process.env.PST_TEST_FILE)("opens a local archive from PST_TEST_FILE", async () => {
    const archive = await PstArchive.open(new File([readFileSync(process.env.PST_TEST_FILE!)], "local.pst"));
    const top = await archive.subfolders(archive.rootFolder.nid);
    const path = await archive.defaultFolderPath(top);
    expect(path.length).toBeGreaterThan(0);
    const list = await archive.contents(path.at(-1)!);
    const [first] = await list.page(0, 50);
    const detail = await archive.message(first.nid);
    expect(detail.subject || detail.text || detail.html).toBeTruthy();
  });
});

describe("message bodies", () => {
  it("decompresses LZFu RTF ([MS-OXRTFCP] example) and de-encapsulates HTML", () => {
    const compressed = Uint8Array.from(
      "2d0000002b0000004c5a4675f1c5c7a703000a007263706731323542320af32068656c090020627705b06c647d0a800fa0".match(/../g)!,
      (hex) => parseInt(hex, 16),
    );
    const rtf = decompressRtf(compressed);
    expect(new TextDecoder().decode(rtf)).toBe("{\\rtf1\\ansi\\ansicpg1252\\pard hello world}\r\n");
    expect(rtfToBody(rtf)).toEqual({ kind: "text", content: "hello world" });

    const encapsulated = new TextEncoder().encode(
      "{\\rtf1\\ansi\\ansicpg1252\\fromhtml1 {\\fonttbl{\\f0 Arial;}}{\\*\\htmltag19 <html>}\\htmlrtf {\\htmlrtf0 Caf\\'e9{\\*\\htmltag84 <br>}\\htmlrtf }\\htmlrtf0 {\\*\\htmltag27 </html>}}",
    );
    expect(rtfToBody(encapsulated)).toEqual({ kind: "html", content: "<html>Café<br></html>" });
  });

  it("strips active content and remote references from HTML bodies", () => {
    const { html, blockedRemote } = sanitizeEmailHtml(
      `<html><head><link rel="stylesheet"><style>body{background:url(https://t.example/p.png)}</style></head>
       <body onload="x()"><script>alert(1)</script><p onclick="y()">Hi <a href="https://evil.example/">link</a></p>
       <img src="https://t.example/pixel.gif"><img src="cid:logo@x"><embed src="x.swf"><object data="x.swf"></object><form><input></form></body></html>`,
      (cid) => (cid === "logo@x" ? "blob:local-logo" : undefined),
    );
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain('src="blob:local-logo"');
    expect(html).toContain('title="https://evil.example/"');
    expect(html).not.toMatch(/<script|<iframe|<embed|<object|<form|<link|onload|onclick|href=|https:\/\/t\.example/);
    expect(blockedRemote).toBe(2);
  });
});
