import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const examplesDir = new URL("../examples", import.meta.url).pathname;
mkdirSync(examplesDir, { recursive: true });

function padTo(buf, align) {
  const rem = buf.length % align;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(align - rem)]);
}

function buildElf64Sample({ isShared }) {
  // Minimal valid ELF64 LSB x86-64 binary with PT_LOAD, PT_INTERP, PT_NOTE (GNU Build-ID),
  // .shstrtab, .dynstr, .dynsym, .dynamic (DT_NEEDED + DT_SONAME), .text
  const ehdrSize = 64;
  const phdrSize = 56;
  const phCount = 3;
  const interpStr = Buffer.from("/lib64/ld-linux-x86-64.so.2\0");
  const notePayload = Buffer.concat([
    Buffer.from([4, 0, 0, 0, 16, 0, 0, 0, 3, 0, 0, 0]), // namesz=4, descsz=16, NT_GNU_BUILD_ID=3
    Buffer.from("GNU\0"),
    Buffer.from("0123456789abcdef", "hex").length === 8
      ? Buffer.from("00112233445566778899aabbccddeeff", "hex")
      : Buffer.from("00112233445566778899aabbccddeeff", "hex"),
  ]);
  const textBytes = Buffer.from([0x31, 0xc0, 0xc3, 0x90]); // xor eax,eax; ret; nop
  const dynstr = Buffer.from("\0libc.so.6\0libsample.so.1\0sample_init\0printf\0");
  const shstrtab = Buffer.from("\0.interp\0.note.gnu.build-id\0.text\0.dynstr\0.dynsym\0.dynamic\0.shstrtab\0");

  // dynsym: 3 entries * 24 bytes = 72
  const dynsym = Buffer.alloc(72);
  // [1] sample_init (GLOBAL FUNC, shndx=3 .text, val=0x401000, size=4)
  dynsym.writeUInt32LE(dynstr.indexOf("sample_init"), 24);
  dynsym[24 + 4] = (1 << 4) | 2; // STB_GLOBAL | STT_FUNC
  dynsym.writeUInt16LE(3, 24 + 6);
  dynsym.writeBigUInt64LE(0x401000n, 24 + 8);
  dynsym.writeBigUInt64LE(4n, 24 + 16);
  // [2] printf (GLOBAL FUNC, UND)
  dynsym.writeUInt32LE(dynstr.indexOf("printf"), 48);
  dynsym[48 + 4] = (1 << 4) | 2;
  dynsym.writeUInt16LE(0, 48 + 6);

  // dynamic: 3 entries * 16 bytes = 48 (DT_NEEDED, DT_SONAME/DT_NULL)
  const dynamic = Buffer.alloc(48);
  dynamic.writeBigInt64LE(1n, 0); // DT_NEEDED
  dynamic.writeBigUInt64LE(BigInt(dynstr.indexOf("libc.so.6")), 8);
  if (isShared) {
    dynamic.writeBigInt64LE(14n, 16); // DT_SONAME
    dynamic.writeBigUInt64LE(BigInt(dynstr.indexOf("libsample.so.1")), 24);
  } else {
    dynamic.writeBigInt64LE(0n, 16);
  }
  dynamic.writeBigInt64LE(0n, 32); // DT_NULL

  const phOff = ehdrSize;
  let cursor = phOff + phdrSize * phCount;
  const interpOff = cursor; cursor += interpStr.length;
  cursor = Math.ceil(cursor / 4) * 4;
  const noteOff = cursor; cursor += notePayload.length;
  cursor = Math.ceil(cursor / 16) * 16;
  const textOff = cursor; cursor += textBytes.length;
  const dynstrOff = cursor; cursor += dynstr.length;
  cursor = Math.ceil(cursor / 8) * 8;
  const dynsymOff = cursor; cursor += dynsym.length;
  const dynamicOff = cursor; cursor += dynamic.length;
  const shstrOff = cursor; cursor += shstrtab.length;
  cursor = Math.ceil(cursor / 8) * 8;
  const shOff = cursor;

  const shCount = 8;
  const totalSize = shOff + shCount * 64;
  const out = Buffer.alloc(totalSize);

  // ELF64 header
  out.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 3], 0); // ELF64 LSB Linux
  out.writeUInt16LE(isShared ? 3 : 2, 16); // ET_DYN or ET_EXEC
  out.writeUInt16LE(62, 18); // EM_X86_64
  out.writeUInt32LE(1, 20);
  out.writeBigUInt64LE(isShared ? 0x1000n : 0x401000n, 24); // e_entry
  out.writeBigUInt64LE(BigInt(phOff), 32);
  out.writeBigUInt64LE(BigInt(shOff), 40);
  out.writeUInt16LE(ehdrSize, 52);
  out.writeUInt16LE(phdrSize, 54);
  out.writeUInt16LE(phCount, 56);
  out.writeUInt16LE(64, 58);
  out.writeUInt16LE(shCount, 60);
  out.writeUInt16LE(7, 62); // .shstrtab index

  const writePh = (idx, type, flags, offset, vaddr, filesz, memsz, align) => {
    const base = phOff + idx * phdrSize;
    out.writeUInt32LE(type, base);
    out.writeUInt32LE(flags, base + 4);
    out.writeBigUInt64LE(BigInt(offset), base + 8);
    out.writeBigUInt64LE(BigInt(vaddr), base + 16);
    out.writeBigUInt64LE(BigInt(vaddr), base + 24);
    out.writeBigUInt64LE(BigInt(filesz), base + 32);
    out.writeBigUInt64LE(BigInt(memsz), base + 40);
    out.writeBigUInt64LE(BigInt(align), base + 48);
  };
  writePh(0, 1, 5, 0, isShared ? 0 : 0x400000, shOff, shOff, 0x1000); // PT_LOAD
  writePh(1, 3, 4, interpOff, 0x400000 + interpOff, interpStr.length, interpStr.length, 1); // PT_INTERP
  writePh(2, 4, 4, noteOff, 0x400000 + noteOff, notePayload.length, notePayload.length, 4); // PT_NOTE

  interpStr.copy(out, interpOff);
  notePayload.copy(out, noteOff);
  textBytes.copy(out, textOff);
  dynstr.copy(out, dynstrOff);
  dynsym.copy(out, dynsymOff);
  dynamic.copy(out, dynamicOff);
  shstrtab.copy(out, shstrOff);

  const writeSh = (idx, name, type, flags, addr, offset, size, link, entsize) => {
    const base = shOff + idx * 64;
    out.writeUInt32LE(name ? shstrtab.indexOf(name) : 0, base);
    out.writeUInt32LE(type, base + 4);
    out.writeBigUInt64LE(BigInt(flags), base + 8);
    out.writeBigUInt64LE(BigInt(addr), base + 16);
    out.writeBigUInt64LE(BigInt(offset), base + 24);
    out.writeBigUInt64LE(BigInt(size), base + 32);
    out.writeUInt32LE(link, base + 40);
    out.writeBigUInt64LE(BigInt(entsize), base + 56);
  };
  writeSh(0, "", 0, 0, 0, 0, 0, 0, 0);
  writeSh(1, ".interp", 1, 2, 0x400000 + interpOff, interpOff, interpStr.length, 0, 0);
  writeSh(2, ".note.gnu.build-id", 7, 2, 0x400000 + noteOff, noteOff, notePayload.length, 0, 0);
  writeSh(3, ".text", 1, 6, isShared ? 0x1000 : 0x401000, textOff, textBytes.length, 0, 0);
  writeSh(4, ".dynstr", 3, 2, 0x400000 + dynstrOff, dynstrOff, dynstr.length, 0, 0);
  writeSh(5, ".dynsym", 11, 2, 0x400000 + dynsymOff, dynsymOff, dynsym.length, 4, 24);
  writeSh(6, ".dynamic", 6, 3, 0x400000 + dynamicOff, dynamicOff, dynamic.length, 4, 16);
  writeSh(7, ".shstrtab", 3, 0, 0, shstrOff, shstrtab.length, 0, 0);

  return out;
}

function buildPe64Sample({ isDll }) {
  // Minimal valid PE32+ (AMD64) binary with .text, .rdata (exports + imports + debug RSDS)
  const dosSize = 0x80;
  const headersSize = 0x400; // FileAlignment 0x200
  const textOffset = 0x400;
  const rdataOffset = 0x600;
  const rdataRva = 0x2000;

  // Layout inside .rdata (RVA 0x2000, file offset 0x600)
  const parts = [];
  let rdataCursor = 0;
  const appendBytes = (buf) => {
    const startRva = rdataRva + rdataCursor;
    parts.push(buf);
    rdataCursor += buf.length;
    return startRva;
  };
  const appendCString = (s) => appendBytes(Buffer.from(`${s}\0`, "ascii"));

  const kernel32StrRva = appendCString("KERNEL32.dll");
  const exitProcessHintRva = appendBytes(Buffer.concat([Buffer.from([0, 0]), Buffer.from("ExitProcess\0", "ascii")]));
  const dllNameRva = appendCString("sample.dll");
  const exportFnNameRva = appendCString("sample_export");

  // ILT for KERNEL32.dll (2 * 8 bytes, 8-byte aligned)
  if (rdataCursor % 8 !== 0) appendBytes(Buffer.alloc(8 - (rdataCursor % 8)));
  const iltRva = rdataRva + rdataCursor;
  const ilt = Buffer.alloc(16);
  ilt.writeBigUInt64LE(BigInt(exitProcessHintRva), 0);
  appendBytes(ilt);

  // Import Directory (2 * 20 bytes)
  const importDirRva = rdataRva + rdataCursor;
  const impDesc = Buffer.alloc(40);
  impDesc.writeUInt32LE(iltRva, 0);
  impDesc.writeUInt32LE(kernel32StrRva, 12);
  impDesc.writeUInt32LE(iltRva, 16);
  appendBytes(impDesc);

  // Export Directory (only if DLL)
  let exportDirRva = 0;
  let exportDirSize = 0;
  if (isDll) {
    const addrFuncsRva = rdataRva + rdataCursor;
    const eat = Buffer.alloc(4);
    eat.writeUInt32LE(0x1000, 0);
    appendBytes(eat);

    const addrNamesRva = rdataRva + rdataCursor;
    const ent = Buffer.alloc(4);
    ent.writeUInt32LE(exportFnNameRva, 0);
    appendBytes(ent);

    const addrOrdsRva = rdataRva + rdataCursor;
    const eot = Buffer.alloc(2);
    eot.writeUInt16LE(0, 0);
    appendBytes(eot);

    exportDirRva = rdataRva + rdataCursor;
    const exp = Buffer.alloc(40);
    exp.writeUInt32LE(dllNameRva, 12);
    exp.writeUInt32LE(1, 16); // Base
    exp.writeUInt32LE(1, 20); // NumberOfFunctions
    exp.writeUInt32LE(1, 24); // NumberOfNames
    exp.writeUInt32LE(addrFuncsRva, 28);
    exp.writeUInt32LE(addrNamesRva, 32);
    exp.writeUInt32LE(addrOrdsRva, 36);
    appendBytes(exp);
    exportDirSize = 40;
  }

  // Debug CodeView RSDS payload + Debug Directory (28 bytes)
  const cvPayloadOffset = rdataOffset + rdataCursor;
  const cvPayload = Buffer.concat([
    Buffer.from("RSDS", "ascii"),
    Buffer.from("11223344556677889900aabbccddeeff", "hex"),
    Buffer.from([1, 0, 0, 0]),
    Buffer.from("sample.pdb\0", "ascii"),
  ]);
  const cvPayloadRva = appendBytes(cvPayload);
  const debugDirRva = rdataRva + rdataCursor;
  const dbgDir = Buffer.alloc(28);
  dbgDir.writeUInt32LE(2, 12); // IMAGE_DEBUG_TYPE_CODEVIEW
  dbgDir.writeUInt32LE(cvPayload.length, 16);
  dbgDir.writeUInt32LE(cvPayloadRva, 20);
  dbgDir.writeUInt32LE(cvPayloadOffset, 24);
  appendBytes(dbgDir);

  const rdataRaw = padTo(Buffer.concat(parts), 0x200);
  const textRaw = Buffer.alloc(0x200);
  textRaw.set([0x31, 0xc0, 0xc3], 0); // xor eax,eax; ret

  const totalSize = rdataOffset + rdataRaw.length;
  const out = Buffer.alloc(totalSize);

  // DOS header
  out.write("MZ", 0, "ascii");
  out.writeUInt32LE(dosSize, 0x3c);

  // PE\0\0
  out.write("PE\0\0", dosSize, "ascii");
  const coff = dosSize + 4;
  out.writeUInt16LE(0x8664, coff); // AMD64
  out.writeUInt16LE(2, coff + 2); // 2 sections
  out.writeUInt32LE(1735689600, coff + 4);
  out.writeUInt16LE(240, coff + 16); // SizeOfOptionalHeader
  out.writeUInt16LE(isDll ? 0x2022 : 0x0022, coff + 18); // EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE | (DLL)

  const opt = coff + 20;
  out.writeUInt16LE(0x20b, opt); // PE32+
  out.writeUInt32LE(0x200, opt + 4); // SizeOfCode
  out.writeUInt32LE(0x1000, opt + 16); // AddressOfEntryPoint
  out.writeUInt32LE(0x1000, opt + 20); // BaseOfCode
  out.writeBigUInt64LE(isDll ? 0x180000000n : 0x140000000n, opt + 24);
  out.writeUInt32LE(0x1000, opt + 32); // SectionAlignment
  out.writeUInt32LE(0x200, opt + 36); // FileAlignment
  out.writeUInt32LE(0x3000, opt + 56); // SizeOfImage
  out.writeUInt32LE(headersSize, opt + 60); // SizeOfHeaders
  out.writeUInt16LE(3, opt + 68); // WINDOWS_CUI
  out.writeUInt16LE(0x8160, opt + 70); // HIGH_ENTROPY_VA | DYNAMIC_BASE | NX_COMPAT | TERMINAL_SERVER_AWARE
  out.writeUInt32LE(16, opt + 108); // NumberOfRvaAndSizes

  // Data Directories
  if (isDll) {
    out.writeUInt32LE(exportDirRva, opt + 112);
    out.writeUInt32LE(exportDirSize, opt + 116);
  }
  out.writeUInt32LE(importDirRva, opt + 112 + 8);
  out.writeUInt32LE(40, opt + 112 + 12);
  out.writeUInt32LE(debugDirRva, opt + 112 + 6 * 8);
  out.writeUInt32LE(28, opt + 112 + 6 * 8 + 4);

  const secTable = opt + 240;
  // Section 0: .text
  out.write(".text\0\0\0", secTable, "ascii");
  out.writeUInt32LE(3, secTable + 8);
  out.writeUInt32LE(0x1000, secTable + 12);
  out.writeUInt32LE(textRaw.length, secTable + 16);
  out.writeUInt32LE(textOffset, secTable + 20);
  out.writeUInt32LE(0x60000020, secTable + 36); // CODE | EXECUTE | READ
  // Section 1: .rdata
  out.write(".rdata\0\0", secTable + 40, "ascii");
  out.writeUInt32LE(rdataCursor, secTable + 48);
  out.writeUInt32LE(rdataRva, secTable + 52);
  out.writeUInt32LE(rdataRaw.length, secTable + 56);
  out.writeUInt32LE(rdataOffset, secTable + 60);
  out.writeUInt32LE(0x40000040, secTable + 76); // INITIALIZED_DATA | READ

  textRaw.copy(out, textOffset);
  rdataRaw.copy(out, rdataOffset);
  return out;
}

// 1. Compile real Mach-O Universal .dylib, .bundle, Unix .a, ELF .o, COFF .obj via clang/lipo/ar
const work = mkdtempSync(join(tmpdir(), "anyfile-native-examples-"));
try {
  const cSrc = join(work, "sample.c");
  writeFileSync(cSrc, `
int native_add(int a, int b) { return a + b; }
const char *native_label = "anyfile-native";
`);

  const arm64Dylib = join(work, "arm64.dylib");
  const x64Dylib = join(work, "x64.dylib");
  const arm64Obj = join(work, "arm64.o");
  execFileSync("clang", ["-arch", "arm64", "-Os", "-shared", cSrc, "-o", arm64Dylib]);
  execFileSync("clang", ["-arch", "x86_64", "-Os", "-shared", cSrc, "-o", x64Dylib]);
  execFileSync("lipo", ["-create", arm64Dylib, x64Dylib, "-output", join(examplesDir, "sample-universal.dylib")]);
  execFileSync("clang", ["-arch", "arm64", "-Os", "-bundle", cSrc, "-o", join(examplesDir, "sample.bundle")]);

  execFileSync("clang", ["-arch", "arm64", "-Os", "-c", cSrc, "-o", arm64Obj]);
  const libPath = join(examplesDir, "sample.a");
  rmSync(libPath, { force: true });
  execFileSync("ar", ["rcs", libPath, arm64Obj]);

  execFileSync("clang", ["-target", "x86_64-linux-gnu", "-Os", "-c", cSrc, "-o", join(examplesDir, "sample.o")]);
  execFileSync("clang", ["-target", "x86_64-pc-windows-msvc", "-Os", "-c", cSrc, "-o", join(examplesDir, "sample.obj")]);
} finally {
  rmSync(work, { recursive: true, force: true });
}

// 2. Deterministic ELF64 .elf / .so and PE32+ .exe / .dll
writeFileSync(join(examplesDir, "sample.elf"), buildElf64Sample({ isShared: false }));
writeFileSync(join(examplesDir, "sample.so"), buildElf64Sample({ isShared: true }));
writeFileSync(join(examplesDir, "sample.exe"), buildPe64Sample({ isDll: false }));
writeFileSync(join(examplesDir, "sample.dll"), buildPe64Sample({ isDll: true }));

// 3. Negative fixtures for tests
writeFileSync(join(examplesDir, "disguised-text.elf"), "This is plain UTF-8 text disguised as an ELF binary.\n");
writeFileSync(join(examplesDir, "truncated-header.dll"), readFileSync(join(examplesDir, "sample.dll")).subarray(0, 64));
const corruptMacho = Buffer.alloc(64);
corruptMacho.writeUInt32BE(0xcffaedfe, 0); // MH_MAGIC_64 LE
corruptMacho.writeUInt32LE(0x0100000c, 4); // ARM64
corruptMacho.writeUInt32LE(2, 12); // MH_EXECUTE
corruptMacho.writeUInt32LE(10, 16); // ncmds = 10
corruptMacho.writeUInt32LE(99999, 20); // sizeofcmds out of bounds
writeFileSync(join(examplesDir, "corrupt-macho.dylib"), corruptMacho);

writeFileSync(join(examplesDir, "README.md"), `# Native Binary Examples

All sample files in this directory are synthetic or compiled locally from minimal C source with zero external dependencies or proprietary content.

- \`sample.elf\`: Synthetic ELF64 x86-64 executable with \`PT_LOAD\`, \`PT_INTERP\`, \`PT_NOTE\` GNU Build-ID, \`.dynsym\`, and \`.dynamic\` (\`DT_NEEDED\`).
- \`sample.so\`: Synthetic ELF64 x86-64 shared object with \`DT_SONAME\` and \`DT_NEEDED\`.
- \`sample.o\`: ELF64 x86-64 relocatable object compiled via \`clang -target x86_64-linux-gnu -c\`.
- \`sample-universal.dylib\`: Universal (Fat) Mach-O (\`arm64\` + \`x86_64\`) compiled via \`clang -shared\` and combined with \`lipo\`.
- \`sample.bundle\`: Mach-O \`arm64\` loadable bundle compiled via \`clang -bundle\`.
- \`sample.a\`: Unix static library archive created with \`ar rcs\` containing a Mach-O \`arm64\` object member and \`__.SYMDEF\`.
- \`sample.exe\`: Synthetic PE32+ (AMD64) console executable with \`.text\`, \`.rdata\`, \`KERNEL32.dll\` import, and CodeView PDB debug directory.
- \`sample.dll\`: Synthetic PE32+ (AMD64) DLL with export table (\`sample_export\`), import table, and CodeView PDB debug directory.
- \`sample.obj\`: COFF x86-64 relocatable object compiled via \`clang -target x86_64-pc-windows-msvc -c\`.
- \`disguised-text.elf\`, \`truncated-header.dll\`, \`corrupt-macho.dylib\`: Negative test fixtures for rejection and error handling.
`);

console.log("Generated native binary examples successfully.");
