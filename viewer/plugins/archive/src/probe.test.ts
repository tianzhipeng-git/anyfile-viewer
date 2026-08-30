import { gzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

import { probeArchive } from "./probe";
import { tarFixture, zipFixture } from "./test-fixtures";

function file(bytes: Uint8Array, name: string) {
  return new File([bytes.slice().buffer as ArrayBuffer], name);
}

function context(bytes: Uint8Array, name: string, signal = new AbortController().signal) {
  return { file: file(bytes, name), signal };
}

describe("archive probe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["package.zip", "package.jar", "package.whl", "package.egg", "app.pyz", "app.pyzw"])(
    "returns level 2 for a valid ZIP directory named %s",
    async (name) => expect(probeArchive(context(zipFixture(), name))).resolves.toBe(2),
  );

  it("recognizes JMOD and gzip plus TAR without a full-file read", async () => {
    const jmod = new Uint8Array(4 + zipFixture().length);
    jmod.set([0x4a, 0x4d, 1, 0]);
    jmod.set(zipFixture(), 4);
    await expect(probeArchive(context(jmod, "module.jmod"))).resolves.toBe(2);
    const compressed = gzipSync(tarFixture().bytes);
    await expect(probeArchive(context(compressed, "package.tgz"))).resolves.toBe(2);
    await expect(probeArchive(context(compressed, "package.crate"))).resolves.toBe(2);
  });

  it.each(["fake.egg", "fake.pyz", "fake.pyzw", "fake.jmod", "fake.tgz", "fake.crate"])(
    "rejects a disguised suffix %s",
    async (name) => expect(probeArchive(context(new TextEncoder().encode("not an archive"), name))).resolves.toBe(0),
  );

  it("keeps plain compression wrappers at level 1", async () => {
    await expect(probeArchive(context(gzipSync(new TextEncoder().encode("text")), "sample.gz"))).resolves.toBe(1);
  });

  it("keeps recognized archive content and empty files available for inspection", async () => {
    const gzip = gzipSync(new TextEncoder().encode("plain text"));
    await expect(probeArchive(context(gzip, "wrong.zip"))).resolves.toBe(1);
    await expect(probeArchive(context(gzip, "logs.tar.gz"))).resolves.toBe(1);
    await expect(probeArchive(context(new Uint8Array(), "empty.zip"))).resolves.toBe(1);
  });

  it("keeps compound gzip wrappers when streaming decompression is unavailable", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(probeArchive(context(gzipSync(tarFixture().bytes), "package.tgz"))).resolves.toBe(1);
  });

  it("propagates cancellation before reading", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(probeArchive(context(zipFixture(), "sample.zip", controller.signal)))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
