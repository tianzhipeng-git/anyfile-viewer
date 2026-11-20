import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { inspectFont, probeFont } from "./probe";

const fixture = async (name: string) => {
  const bytes = await readFile(`examples/${name}`);
  return new File([bytes], name);
};
const signal = () => new AbortController().signal;

describe("font routing", () => {
  it.each(["Abel-Regular.ttf", "SourceSans3-Regular.otf", "Abel-Regular.woff", "Abel-Regular.woff2"])(
    "identifies %s from the header only",
    async name => {
      const file = await fixture(name); const whole = vi.spyOn(file, "arrayBuffer");
      expect(await probeFont({ file, signal: signal() })).toBe(3);
      expect(whole).not.toHaveBeenCalled();
    },
  );

  it("reports the container of each sample", async () => {
    expect(await inspectFont({ file: await fixture("Abel-Regular.ttf"), signal: signal() })).toMatchObject({ container: "sfnt" });
    expect(await inspectFont({ file: await fixture("Abel-Regular.woff"), signal: signal() })).toMatchObject({ container: "woff" });
    expect(await inspectFont({ file: await fixture("Abel-Regular.woff2"), signal: signal() })).toMatchObject({ container: "woff2" });
  });

  it("rejects files that only claim a font extension", async () => {
    for (const [name, text] of [["fake.ttf", "not a font"], ["fake.woff", "wOFF"], ["fake.woff2", "wOF2"]] as const) {
      expect(await probeFont({ file: new File([text], name), signal: signal() })).toBe(0);
    }
  });

  it("rejects truncated and corrupted tables", async () => {
    const ttf = await readFile("examples/Abel-Regular.ttf");
    const woff = await readFile("examples/Abel-Regular.woff");
    const truncatedTtf = new Uint8Array(ttf.subarray(0, 120));
    const badTag = new Uint8Array(woff); badTag[44] = 0;
    const outside = new Uint8Array(woff); new DataView(outside.buffer).setUint32(48, woff.byteLength + 4);
    const noTables = new Uint8Array(woff); new DataView(noTables.buffer).setUint32(12, 0);
    for (const bytes of [truncatedTtf, badTag, outside, noTables, ttf.subarray(0, 11)]) {
      expect(await probeFont({ file: new File([bytes], "broken.woff"), signal: signal() })).toBe(0);
    }
  });

  it("aborts before reading", async () => {
    await expect(probeFont({ file: await fixture("Abel-Regular.ttf"), signal: AbortSignal.abort() }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
