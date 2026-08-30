import { describe, expect, it } from "vitest";

import { probeDevWasm } from "./probe";
import { wasmFixture } from "./test-fixtures";

describe("dev wasm probe", () => {
  it("recognizes version 1 without loading the full module", async () => {
    const bytes = wasmFixture();
    await expect(probeDevWasm({ file: new File([bytes.slice().buffer as ArrayBuffer], "module.wasm"), signal: new AbortController().signal })).resolves.toBe(2);
  });

  it("rejects disguised and unsupported-version files", async () => {
    await expect(probeDevWasm({ file: new File(["not wasm"], "fake.wasm"), signal: new AbortController().signal })).resolves.toBe(0);
    const future = wasmFixture();
    future[4] = 2;
    await expect(probeDevWasm({ file: new File([future.slice().buffer as ArrayBuffer], "future.wasm"), signal: new AbortController().signal })).resolves.toBe(0);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const bytes = wasmFixture();
    await expect(probeDevWasm({ file: new File([bytes.slice().buffer as ArrayBuffer], "module.wasm"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
