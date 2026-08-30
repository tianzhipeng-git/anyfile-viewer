import { describe, expect, it } from "vitest";

import { probeDevArray } from "./probe";
import { int32Data, npyFixture, npzFixture } from "./test-fixtures";

function context(bytes: Uint8Array, name: string, signal = new AbortController().signal) {
  return { file: new File([bytes.slice().buffer as ArrayBuffer], name), signal };
}

describe("dev array probe", () => {
  it("reports NPY content and object arrays at their true levels", async () => {
    const numeric = npyFixture({ descr: "'<i4'", shape: [2], data: int32Data([1, 2]) });
    const object = npyFixture({ descr: "'|O8'", shape: [1], data: new TextEncoder().encode("pickle") });
    await expect(probeDevArray(context(numeric, "values.npy"))).resolves.toBe(3);
    await expect(probeDevArray(context(object, "objects.npy"))).resolves.toBe(1);
  });

  it("reports a valid NPZ directory at level 2", async () => {
    const array = npyFixture({ descr: "'<i4'", shape: [1], data: int32Data([7]) });
    await expect(probeDevArray(context(npzFixture({ "values.npy": array }), "arrays.npz"))).resolves.toBe(2);
  });

  it.each(["fake.npy", "fake.npz"])("rejects disguised suffix %s", async (name) => {
    await expect(probeDevArray(context(new TextEncoder().encode("not numpy"), name))).resolves.toBe(0);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const array = npyFixture({ descr: "'<i4'", shape: [1], data: int32Data([1]) });
    await expect(probeDevArray(context(array, "values.npy", controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
