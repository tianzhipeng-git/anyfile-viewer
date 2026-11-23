import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadOfdDocument } from "./document";
import { loadOfdPage } from "./model";
import { OfdPackage } from "./package";
import { extractSealPicture } from "./seal";

/** Optional: `OFD_TEST_DIR=/abs/dir pnpm test viewer/plugins/ofd` parses every page of every `.ofd` there. */
const dir = process.env.OFD_TEST_DIR;

describe.runIf(dir)("OFD local corpus", () => {
  it("parses every page model and finds every seal picture", async () => {
    const failures: string[] = [];
    const signal = new AbortController().signal;
    for (const name of readdirSync(dir!).filter((item) => item.toLowerCase().endsWith(".ofd"))) {
      const pkg = await OfdPackage.open(new File([readFileSync(join(dir!, name))], name), signal);
      try {
        const doc = await loadOfdDocument(pkg);
        for (let index = 0; index < doc.pages.length; index += 1) await loadOfdPage(doc, index);
        for (const stamps of doc.stamps.values()) {
          for (const stamp of stamps) {
            const found = await Promise.all(stamp.sources.map(async (source) => extractSealPicture(await pkg.bytes(source, 1 << 24))));
            if (!found.some(Boolean)) failures.push(`${name}: no seal picture in ${stamp.sources.join(", ")}`);
          }
        }
      } catch (error) {
        failures.push(`${name}: ${String(error)}`);
      } finally {
        await pkg.close();
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
