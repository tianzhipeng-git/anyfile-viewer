import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewerTestContext, truncated } from "@anyfile/viewer-test";

import { devNativeBinaryViewer } from "./index";
import { MAX_FILE_BYTES } from "./limits";
import { parseNativeBinary } from "./parser";

const examplesDir = join(import.meta.dirname, "..", "examples");
const cleanupQueue: Array<() => void> = [];

function loadExampleFile(name: string): File {
  const bytes = readFileSync(join(examplesDir, name));
  return new File([bytes], name);
}

afterEach(() => {
  while (cleanupQueue.length > 0) cleanupQueue.pop()?.();
});

describe("dev-native-binary parser and viewer", () => {
  it("parses ELF64 executable, shared library, and clang-compiled ELF object", async () => {
    const elf = await parseNativeBinary(loadExampleFile("sample.elf"), new AbortController().signal);
    expect(elf.format).toBe("ELF");
    expect(elf.slices[0].architecture).toContain("x86-64");
    expect(elf.slices[0].dependencies.some((d) => d.kind === "DT_NEEDED" && d.name === "libc.so.6")).toBe(true);
    expect(elf.slices[0].metadata.some((m) => m.key === "Dynamic linker" && m.value.includes("ld-linux"))).toBe(true);
    expect(elf.slices[0].metadata.some((m) => m.key === "GNU Build ID")).toBe(true);
    expect(elf.slices[0].symbols.some((s) => s.name === "sample_init")).toBe(true);

    const so = await parseNativeBinary(loadExampleFile("sample.so"), new AbortController().signal);
    expect(so.slices[0].dependencies.some((d) => d.kind === "DT_SONAME" && d.name === "libsample.so.1")).toBe(true);

    const obj = await parseNativeBinary(loadExampleFile("sample.o"), new AbortController().signal);
    expect(obj.slices[0].kind).toContain("ET_REL");
    expect(obj.slices[0].symbols.some((s) => s.name === "native_add")).toBe(true);
  });

  it("parses Universal Fat Mach-O, Mach-O bundle, and Unix archive", async () => {
    const fat = await parseNativeBinary(loadExampleFile("sample-universal.dylib"), new AbortController().signal);
    expect(fat.format).toBe("Mach-O Fat");
    expect(fat.slices).toHaveLength(2);
    expect(fat.slices.map((s) => s.architecture)).toEqual(["x86-64 (x86_64)", "ARM64 (aarch64)"]);
    expect(fat.slices[0].symbols.some((s) => s.name.includes("native_add"))).toBe(true);

    const bundle = await parseNativeBinary(loadExampleFile("sample.bundle"), new AbortController().signal);
    expect(bundle.format).toBe("Mach-O");
    expect(bundle.slices[0].kind).toContain("MH_BUNDLE");

    const archive = await parseNativeBinary(loadExampleFile("sample.a"), new AbortController().signal);
    expect(archive.format).toBe("Unix Archive");
    expect(archive.slices[0].members?.some((m) => m.kind === "Mach-O object")).toBe(true);
    expect(archive.slices[0].members?.some((m) => m.kind === "Symbol index")).toBe(true);
  });

  it("parses PE32+ DLL, PE32+ EXE, and COFF object", async () => {
    const dll = await parseNativeBinary(loadExampleFile("sample.dll"), new AbortController().signal);
    expect(dll.format).toBe("PE");
    expect(dll.slices[0].kind).toContain("DLL");
    expect(dll.slices[0].dependencies.some((d) => d.kind === "DLL Import" && d.name === "KERNEL32.dll")).toBe(true);
    expect(dll.slices[0].symbols.some((s) => s.kind === "EXPORT" && s.name === "sample_export")).toBe(true);
    expect(dll.slices[0].symbols.some((s) => s.kind === "IMPORT" && s.name === "ExitProcess")).toBe(true);
    expect(dll.slices[0].metadata.some((m) => m.key === "CodeView PDB" && m.value.includes("sample.pdb"))).toBe(true);

    const exe = await parseNativeBinary(loadExampleFile("sample.exe"), new AbortController().signal);
    expect(exe.slices[0].kind).toBe("PE Executable");

    const coff = await parseNativeBinary(loadExampleFile("sample.obj"), new AbortController().signal);
    expect(coff.format).toBe("COFF");
    expect(coff.slices[0].symbols.some((s) => s.name.includes("native_add"))).toBe(true);
  });

  it("parses big-endian ELF32 with SHT_NOBITS .bss and Unix archive GNU/Go/Rust metadata", async () => {
    // Big-endian ELF32 PowerPC with 1 SHT_NOBITS section (.bss) whose sh_size exceeds file size
    const elf32 = new Uint8Array(52 + 80);
    elf32.set([0x7f, 0x45, 0x4c, 0x46, 1, 2, 1, 0], 0); // ELF32 MSB
    const ev = new DataView(elf32.buffer);
    ev.setUint16(16, 2, false); // ET_EXEC
    ev.setUint16(18, 20, false); // PowerPC
    ev.setUint32(20, 1, false);
    ev.setUint32(32, 52, false); // e_shoff
    ev.setUint16(46, 40, false);
    ev.setUint16(48, 2, false); // 2 sections
    // Section 1: SHT_NOBITS (8), offset=0, size=64 MiB
    ev.setUint32(52 + 40 + 4, 8, false);
    ev.setUint32(52 + 40 + 20, 64 * 1024 * 1024, false);

    const elfReport = await parseNativeBinary(new File([elf32], "ppc.elf"), new AbortController().signal);
    expect(elfReport.slices[0].endianness).toBe("Big-endian");
    expect(elfReport.slices[0].architecture).toBe("PowerPC");
    expect(elfReport.slices[0].sections[1].type).toBe("NOBITS");

    // Unix archive with GNU '//' long-name table and Go __.PKGDEF
    const strPayload = new TextEncoder().encode("very_long_member_object_name.o/\n");
    const makeArHeader = (name: string, size: number) => {
      const h = new TextEncoder().encode(
        `${name.padEnd(16, " ")}${"0".padEnd(12, " ")}${"0".padEnd(6, " ")}${"0".padEnd(6, " ")}${"100644".padEnd(8, " ")}${String(size).padEnd(10, " ")}\`\n`,
      );
      return h;
    };
    const pkgDef = new TextEncoder().encode("go object darwin arm64\n");
    const padEven = (u8: Uint8Array) => (u8.length % 2 === 1 ? new Uint8Array([...u8, 0x0a]) : u8);
    const arChunks = [
      new TextEncoder().encode("!<arch>\n"),
      makeArHeader("//", strPayload.length),
      padEven(strPayload),
      makeArHeader("/0", 4),
      new Uint8Array([0x7f, 0x45, 0x4c, 0x46]),
      makeArHeader("__.PKGDEF/", pkgDef.length),
      padEven(pkgDef),
    ];
    const totalLen = arChunks.reduce((acc, c) => acc + c.length, 0);
    const arBuf = new Uint8Array(totalLen);
    let off = 0;
    for (const c of arChunks) { arBuf.set(c, off); off += c.length; }

    const arReport = await parseNativeBinary(new File([arBuf], "pkg.a"), new AbortController().signal);
    expect(arReport.slices[0].kind).toContain("Go package archive");
    expect(arReport.slices[0].members?.map((m) => m.name)).toContain("very_long_member_object_name.o");
  });

  it("mounts interactive UI, switches fat slices, filters rows, and enforces structural-only banner", async () => {
    const file = loadExampleFile("sample-universal.dylib");
    const testCtx = createViewerTestContext(file);
    cleanupQueue.push(() => testCtx.cleanup());
    const reportPreview = vi.fn();

    const controller = await devNativeBinaryViewer.open({ ...testCtx.context, reportPreview });
    expect(reportPreview).toHaveBeenCalledExactlyOnceWith({ outcome: "success", kind: "structure" });
    expect(testCtx.container.textContent).toContain("非反编译或反汇编");
    expect(testCtx.container.textContent).toContain("x86-64");

    // Switch architecture slice
    const select = testCtx.container.querySelector("select") as HTMLSelectElement;
    expect(select).not.toBeNull();
    select.value = "1";
    select.dispatchEvent(new Event("change"));
    expect(testCtx.container.textContent).toContain("ARM64");

    // Filter symbols
    const search = testCtx.container.querySelector("input[type='search']") as HTMLInputElement;
    search.value = "native_add";
    search.dispatchEvent(new Event("input"));
    expect(testCtx.container.textContent).toContain("native_add");

    // Lifecycle: idempotent dispose & outside untouched
    controller.dispose();
    controller.dispose();
    expect(testCtx.container.childElementCount).toBe(0);
    expect(testCtx.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("rejects disguised, truncated, corrupt, and oversized inputs cleanly", async () => {
    for (const bad of ["disguised-text.elf", "truncated-header.dll", "corrupt-macho.dylib"]) {
      const ctx = createViewerTestContext(loadExampleFile(bad));
      cleanupQueue.push(() => ctx.cleanup());
      await expect(devNativeBinaryViewer.open(ctx.context)).rejects.toMatchObject({ code: "invalid-file" });
      expect(ctx.container.childElementCount).toBe(0);
    }

    // Truncated mid-ELF header
    const elfBytes = new Uint8Array(readFileSync(join(examplesDir, "sample.elf")));
    const truncCtx = createViewerTestContext(new File([truncated(elfBytes, 48).slice().buffer], "short.elf"));
    cleanupQueue.push(() => truncCtx.cleanup());
    await expect(devNativeBinaryViewer.open(truncCtx.context)).rejects.toMatchObject({ code: "invalid-file" });

    // Oversized file budget (> 512 MiB)
    const oversizedFile = new File(["\x7fELF"], "huge.elf");
    Object.defineProperty(oversizedFile, "size", { value: MAX_FILE_BYTES + 1 });
    const limitCtx = createViewerTestContext(oversizedFile);
    cleanupQueue.push(() => limitCtx.cleanup());
    await expect(devNativeBinaryViewer.open(limitCtx.context)).rejects.toMatchObject({ code: "resource-limit" });

    // Excessive ELF section count (> MAX_SECTIONS)
    const hugeSecElf = new Uint8Array(64);
    hugeSecElf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
    new DataView(hugeSecElf.buffer).setUint16(60, 5000, true);
    const secLimitCtx = createViewerTestContext(new File([hugeSecElf], "many-sections.elf"));
    cleanupQueue.push(() => secLimitCtx.cleanup());
    await expect(devNativeBinaryViewer.open(secLimitCtx.context)).rejects.toMatchObject({ code: "resource-limit" });
  });

  it("handles opening and active abort cleanly", async () => {
    const ctx = createViewerTestContext(loadExampleFile("sample.dll"));
    cleanupQueue.push(() => ctx.cleanup());
    ctx.abortController.abort();
    await expect(devNativeBinaryViewer.open(ctx.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(ctx.container.childElementCount).toBe(0);

    const active = createViewerTestContext(loadExampleFile("sample.exe"));
    cleanupQueue.push(() => active.cleanup());
    await devNativeBinaryViewer.open(active.context);
    expect(active.container.childElementCount).toBe(1);
    active.abortController.abort();
    expect(active.container.childElementCount).toBe(0);
    expect(active.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  const externalDir = process.env.NATIVE_BINARY_TEST_DIR;
  if (externalDir) {
    it("parses external real-world binaries from NATIVE_BINARY_TEST_DIR", async () => {
      for (const name of readdirSync(externalDir)) {
        const bytes = readFileSync(join(externalDir, name));
        const report = await parseNativeBinary(new File([bytes], name), new AbortController().signal);
        expect(report.slices.length).toBeGreaterThan(0);
      }
    });
  }
});
