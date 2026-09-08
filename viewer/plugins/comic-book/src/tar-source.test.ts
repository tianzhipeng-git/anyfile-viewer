import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openComicTar } from "./tar-source";
import { parseComic } from "./model";
import { probeComicBook } from "./probe";
const file = (name: string) => new File([readFileSync(resolve("../../../docs/ebooks/fixtures/phase45",name))],name);
describe("Comic container routing and TAR ranges", () => {
  it.each(["pages.cbt", "rar4.cbr", "rar5.cbr", "pages.cb7"])("routes %s without a decoder", async name => {
    const input = file(name); vi.spyOn(input,"arrayBuffer").mockRejectedValue(new Error("Whole file read"));
    expect(await probeComicBook({ file: input, signal: new AbortController().signal })).toBe(4);
  });
  it("keeps natural ordering and reads only requested TAR data", async () => {
    const controller = new AbortController(), input = file("pages.cbt");
    vi.spyOn(input,"arrayBuffer").mockRejectedValue(new Error("Whole file read"));
    const source = await openComicTar(input, controller.signal), comic = await parseComic(source,controller.signal);
    expect(comic.pages.map(p=>p.path)).toEqual([1,2,3,4,10].map(n=>`volume1/${n}.png`));
    expect((await source.read(comic.pages[0].path,1024))[0]).toBe(137);
    await expect(source.read(comic.pages[0].path,1)).rejects.toMatchObject({ code:"resource-limit" });
    controller.abort(); await expect(source.read(comic.pages[0].path,1024)).rejects.toMatchObject({ name:"AbortError" });
    await source.dispose(); await source.dispose(); expect(source.entries.size).toBe(0);
  });
  it("rejects path escapes and damaged checksums", async () => {
    const signal = new AbortController().signal;
    await expect(openComicTar(file("traversal.cbt"),signal)).rejects.toMatchObject({ code:"invalid-file" });
    const bytes = new Uint8Array(await file("pages.cbt").arrayBuffer());bytes[0]^=1;
    await expect(openComicTar(new File([bytes],"bad.cbt"),signal)).rejects.toMatchObject({ code:"invalid-file" });
  });
});
