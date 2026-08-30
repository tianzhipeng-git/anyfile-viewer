import { describe, expect, it } from "vitest";

import { probeDevSourceMap } from "./probe";

function context(content: string, signal = new AbortController().signal) {
  return { file: new File([content], "bundle.js.map"), signal };
}

describe("dev source map probe", () => {
  it("recognizes ordinary and indexed version 3 maps", async () => {
    await expect(probeDevSourceMap(context('{"version":3,"sources":[],"names":[],"mappings":""}'))).resolves.toBe(3);
    await expect(probeDevSourceMap(context('{"version":3,"sections":[]}'))).resolves.toBe(3);
  });

  it("recognizes mappings after a large sourcesContent field", async () => {
    const content = JSON.stringify({
      version: 3,
      sources: ["large.ts"],
      sourcesContent: ["x".repeat(128 * 1024)],
      names: [],
      mappings: "",
    });
    await expect(probeDevSourceMap(context(content))).resolves.toBe(3);
  });

  it("rejects disguised JSON and invalid UTF-8", async () => {
    await expect(probeDevSourceMap(context('{"hello":"world"}'))).resolves.toBe(0);
    await expect(probeDevSourceMap({ file: new File([Uint8Array.of(0xff, 0xfe)], "fake.map"), signal: new AbortController().signal })).resolves.toBe(0);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeDevSourceMap(context('{"version":3,"mappings":""}', controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
