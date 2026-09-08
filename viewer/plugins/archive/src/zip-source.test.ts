import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { openBookZip, ProtectedBookError } from "./zip-source";
import { readBookZipCatalog } from "./zip-catalog";
const signal = () => new AbortController().signal;
function fixture(name: string) {
  return new File(
    [readFileSync(resolve(process.cwd(), "../../../docs/ebooks/fixtures", name))],
    name,
  );
}
describe("bounded publication ZIP source", () => {
  it("reads a selected deflated entry with CRC validation, without whole-file reads", async () => {
    const file = fixture("epub3.epub"),
      whole = vi.spyOn(file, "arrayBuffer");
    const zip = await openBookZip(file, signal());
    expect(new TextDecoder().decode(await zip.read("OPS/chapter1.xhtml", 100_000))).toContain(
      "Chapter 1",
    );
    expect(whole).not.toHaveBeenCalled();
    await zip.dispose();
    await zip.dispose();
    await expect(zip.read("mimetype", 64)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("preserves distinct legacy ZIP filename bytes during routing", async () => {
    const input = fixture("legacy-names.cbz");
    expect((await readBookZipCatalog(input, signal())).names.size).toBe(2);
    const zip = await openBookZip(input, signal());
    expect([...zip.entries.keys()].sort()).toEqual(["â.png", "é.png"]);
    expect((await zip.read("é.png", 10000)).length).toBeGreaterThan(0);
    await zip.dispose();
  });
  it("reads ZIP64 indexes using the existing archive fixture", async () => {
    const file = fixture("zip64.cbz");
    expect((await readBookZipCatalog(file, signal())).layout.zip64).toBe(true);
  });
  it.each(["duplicate.cbz", "traversal.cbz"])("rejects unsafe paths: %s", async (name) => {
    await expect(openBookZip(fixture(name), signal())).rejects.toMatchObject({
      code: "invalid-file",
    });
  });
  it.each(["bomb.cbz", "many-entries.cbz"])(
    "rejects budgets before expansion: %s",
    async (name) => {
      await expect(openBookZip(fixture(name), signal())).rejects.toMatchObject({
        code: "resource-limit",
      });
    },
  );
  it("distinguishes encryption from corruption", async () => {
    await expect(openBookZip(fixture("encrypted.cbz"), signal())).rejects.toBeInstanceOf(
      ProtectedBookError,
    );
  });
  it("checks per-request limits and cancellation", async () => {
    const zip = await openBookZip(fixture("epub3.epub"), signal());
    await expect(zip.read("OPS/chapter1.xhtml", 10)).rejects.toMatchObject({
      code: "resource-limit",
    });
    const abort = new AbortController();
    abort.abort();
    await expect(zip.read("mimetype", 64, abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(openBookZip(fixture("epub3.epub"), abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await zip.dispose();
  });
});
