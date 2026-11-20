import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";

import { probeDevNativeBinary } from "./probe";

const examplesDir = join(import.meta.dirname, "..", "examples");

describe("dev-native-binary probe", () => {
  it.each([
    "sample.elf",
    "sample.so",
    "sample.o",
    "sample-universal.dylib",
    "sample.bundle",
    "sample.a",
    "sample.exe",
    "sample.dll",
    "sample.obj",
  ])("returns level 1 for valid binary %s using bounded reads", async (name) => {
    const bytes = new Uint8Array(readFileSync(join(examplesDir, name)));
    const { file, reads } = createTrackedFile(bytes, name);
    const level = await probeDevNativeBinary({ file, signal: new AbortController().signal });
    expect(level).toBe(1);
    const allowed = name === "sample-universal.dylib"
      ? [{ start: 0, end: 512 }, { start: 4096, end: 4100 }]
      : [{ start: 0, end: Math.min(bytes.length, 4096) }];
    assertReadsWithin(reads, allowed);
  });

  it("rejects Wavefront OBJ text, Java class 0xCAFEBABE, disguised text, and truncated binaries", async () => {
    const wavefront = new File(["v 0 0 0\nv 1 0 0\nf 1 2 3\n"], "mesh.obj");
    expect(await probeDevNativeBinary({ file: wavefront, signal: new AbortController().signal })).toBe(0);

    // Java class file: 0xCAFEBABE + minor=0, major=65 (>= 45)
    const javaClass = new Uint8Array(64);
    new DataView(javaClass.buffer).setUint32(0, 0xcafebabe, false);
    new DataView(javaClass.buffer).setUint16(6, 65, false);
    expect(await probeDevNativeBinary({
      file: new File([javaClass], "Hello.dylib"),
      signal: new AbortController().signal,
    })).toBe(0);

    for (const negative of ["disguised-text.elf", "truncated-header.dll", "corrupt-macho.dylib"]) {
      const bytes = readFileSync(join(examplesDir, negative));
      expect(await probeDevNativeBinary({
        file: new File([bytes], negative),
        signal: new AbortController().signal,
      })).toBe(0);
    }
  });

  it("propagates abort before reading", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      probeDevNativeBinary({ file: new File(["\x7fELF"], "aborted.elf"), signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
