import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { readFont } from "./metadata";

const read = async (name: string) => {
  const bytes = new Uint8Array(await readFile(`examples/${name}`));
  return { bytes, font: await readFont(bytes, bytes.byteLength) };
};

describe("font metadata", () => {
  it("reads the name, head, maxp and OS/2 tables of an sfnt font", async () => {
    const { font } = await read("Abel-Regular.ttf");
    expect(font.metadata).toMatchObject({ family: "Abel", subfamily: "Regular", glyphs: 259, unitsPerEm: 2048 });
    expect(font.metadata.version).toContain("Version");
    expect(font.tables.map(({ tag }) => tag)).toEqual(expect.arrayContaining(["head", "maxp", "cmap", "name"]));
  });

  it("reads OpenType CFF outlines", async () => {
    const { font } = await read("SourceSans3-Regular.otf");
    expect(font.metadata.family).toContain("Source Sans");
    expect(font.metadata.glyphs).toBeGreaterThan(200);
  });

  it("decompresses WOFF tables before reading names", async () => {
    const ttf = await read("Abel-Regular.ttf");
    const { font } = await read("Abel-Regular.woff");
    expect(font.metadata).toMatchObject({ family: ttf.font.metadata.family, glyphs: ttf.font.metadata.glyphs });
  });

  it("keeps WOFF2 to the table directory because tables are Brotli-compressed", async () => {
    const { font } = await read("Abel-Regular.woff2");
    expect(font.metadata.family).toBeUndefined();
    expect(font.tables.map(({ tag }) => tag)).toEqual(expect.arrayContaining(["head", "maxp", "cmap"]));
  });

  it("rejects data without a valid directory", async () => {
    await expect(readFont(new Uint8Array(64), 64)).rejects.toThrow("Invalid font directory");
  });
});
