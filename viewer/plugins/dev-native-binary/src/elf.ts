import type { ByteSource } from "@anyfile/dev-binary-core";

import {
  MAX_DYNAMIC_ENTRIES,
  MAX_NOTE_BYTES,
  MAX_PROGRAM_HEADERS,
  MAX_SECTIONS,
  MAX_SYMBOLS_PARSED,
  assertWithinBounds,
  bigIntToSafeNumber,
  checkedMul,
  createDataView,
  formatHex,
  invalidFile,
  readBoundedStringTable,
  readCString,
  resourceLimit,
  toHexBytes,
} from "./limits";
import type {
  BinarySliceReport,
  DependencyEntry,
  KeyValueRow,
  SectionEntry,
  SegmentEntry,
  SymbolEntry,
} from "./model";

const ELF_TYPES: Record<number, string> = {
  0: "ET_NONE (None)",
  1: "ET_REL (Relocatable)",
  2: "ET_EXEC (Executable)",
  3: "ET_DYN (Shared object / PIE)",
  4: "ET_CORE (Core dump)",
};

const ELF_MACHINES: Record<number, string> = {
  3: "x86 (386)",
  8: "MIPS",
  20: "PowerPC",
  21: "PowerPC64",
  22: "IBM S/390",
  40: "ARM",
  42: "SuperH",
  50: "IA-64",
  62: "x86-64 (AMD64)",
  183: "AArch64 (ARM64)",
  243: "RISC-V",
  247: "eBPF",
  258: "LoongArch",
};

const ELF_OSABI: Record<number, string> = {
  0: "System V",
  1: "HP-UX",
  2: "NetBSD",
  3: "Linux / GNU",
  6: "Solaris",
  9: "FreeBSD",
  12: "OpenBSD",
};

const PH_TYPES: Record<number, string> = {
  0: "PT_NULL",
  1: "PT_LOAD",
  2: "PT_DYNAMIC",
  3: "PT_INTERP",
  4: "PT_NOTE",
  5: "PT_SHLIB",
  6: "PT_PHDR",
  7: "PT_TLS",
  0x6474e550: "PT_GNU_EH_FRAME",
  0x6474e551: "PT_GNU_STACK",
  0x6474e552: "PT_GNU_RELRO",
  0x6474e553: "PT_GNU_PROPERTY",
};

const SH_TYPES: Record<number, string> = {
  0: "NULL",
  1: "PROGBITS",
  2: "SYMTAB",
  3: "STRTAB",
  4: "RELA",
  5: "HASH",
  6: "DYNAMIC",
  7: "NOTE",
  8: "NOBITS",
  9: "REL",
  11: "DYNSYM",
  14: "INIT_ARRAY",
  15: "FINI_ARRAY",
  0x6ffffff6: "GNU_HASH",
  0x6ffffffd: "GNU_VERDEF",
  0x6ffffffe: "GNU_VERNEED",
  0x6fffffff: "GNU_VERSYM",
};

const SYM_BINDINGS = ["LOCAL", "GLOBAL", "WEAK"];
const SYM_TYPES = ["NOTYPE", "OBJECT", "FUNC", "SECTION", "FILE", "COMMON", "TLS"];

function formatSegmentFlags(flags: number): string {
  return `${(flags & 4) !== 0 ? "R" : "-"}${(flags & 2) !== 0 ? "W" : "-"}${(flags & 1) !== 0 ? "X" : "-"}`;
}

function formatSectionFlags(flags: bigint): string {
  const out: string[] = [];
  const zero = BigInt(0);
  if ((flags & BigInt(1)) !== zero) out.push("W");
  if ((flags & BigInt(2)) !== zero) out.push("A");
  if ((flags & BigInt(4)) !== zero) out.push("X");
  if ((flags & BigInt(0x10)) !== zero) out.push("M");
  if ((flags & BigInt(0x20)) !== zero) out.push("S");
  if ((flags & BigInt(0x400)) !== zero) out.push("T");
  return out.length > 0 ? out.join("") : "-";
}

function formatSymSection(shndx: number): string {
  if (shndx === 0) return "UND";
  if (shndx === 0xfff1) return "ABS";
  if (shndx === 0xfff2) return "COM";
  if (shndx === 0xffff) return "XINDEX";
  return String(shndx);
}

function parseElfNoteBuildId(bytes: Uint8Array, le: boolean): { gnuBuildId?: string; goBuildId?: string } {
  const view = createDataView(bytes);
  let pos = 0;
  let gnuBuildId: string | undefined;
  let goBuildId: string | undefined;
  while (pos + 12 <= bytes.length) {
    const namesz = view.getUint32(pos, le);
    const descsz = view.getUint32(pos + 4, le);
    const noteType = view.getUint32(pos + 8, le);
    pos += 12;
    const alignedName = Math.ceil(namesz / 4) * 4;
    const alignedDesc = Math.ceil(descsz / 4) * 4;
    if (namesz > 1024 || descsz > 65536 || pos + alignedName + alignedDesc > bytes.length) break;
    const name = readCString(bytes, pos, namesz);
    const desc = bytes.subarray(pos + alignedName, pos + alignedName + descsz);
    if (name === "GNU" && noteType === 3 && descsz > 0 && !gnuBuildId) {
      gnuBuildId = toHexBytes(desc);
    } else if (name === "Go" && noteType === 4 && descsz > 0 && !goBuildId) {
      goBuildId = readCString(desc, 0, descsz);
    }
    pos += alignedName + alignedDesc;
  }
  return { gnuBuildId, goBuildId };
}

type RawSection = {
  index: number;
  nameOffset: number;
  name: string;
  type: number;
  flags: bigint;
  addr: bigint;
  offset: number;
  size: number;
  link: number;
  entsize: number;
};

export async function parseElf(source: ByteSource): Promise<BinarySliceReport> {
  if (source.size < 52) invalidFile("ELF header is truncated.");
  const head = await source.read(0, Math.min(source.size, 64));
  if (head[0] !== 0x7f || head[1] !== 0x45 || head[2] !== 0x4c || head[3] !== 0x46) {
    invalidFile("Invalid ELF magic signature.");
  }
  const elfClass = head[4];
  const elfData = head[5];
  const elfVersion = head[6];
  if ((elfClass !== 1 && elfClass !== 2) || (elfData !== 1 && elfData !== 2) || elfVersion !== 1) {
    invalidFile("Unsupported ELF class, endianness, or version.");
  }
  const is64 = elfClass === 2;
  const le = elfData === 1;
  if (source.size < (is64 ? 64 : 52)) invalidFile("ELF header is truncated.");

  const view = createDataView(head);
  const eType = view.getUint16(16, le);
  const eMachine = view.getUint16(18, le);
  const eEntry = is64 ? view.getBigUint64(24, le) : BigInt(view.getUint32(24, le));
  const ePhoff = bigIntToSafeNumber(is64 ? view.getBigUint64(32, le) : BigInt(view.getUint32(28, le)), "e_phoff");
  const eShoff = bigIntToSafeNumber(is64 ? view.getBigUint64(40, le) : BigInt(view.getUint32(32, le)), "e_shoff");
  const eFlags = view.getUint32(is64 ? 48 : 36, le);
  const ePhentsize = view.getUint16(is64 ? 54 : 42, le);
  const ePhnum = view.getUint16(is64 ? 56 : 44, le);
  const eShentsize = view.getUint16(is64 ? 58 : 46, le);
  let eShnum = view.getUint16(is64 ? 60 : 48, le);
  let eShstrndx = view.getUint16(is64 ? 62 : 50, le);

  if (ePhnum > MAX_PROGRAM_HEADERS) resourceLimit("ELF program header count exceeds browser limit.");
  if (ePhnum > 0 && ePhentsize < (is64 ? 56 : 32)) invalidFile("ELF program header entry size is invalid.");

  const segments: SegmentEntry[] = [];
  const notices: string[] = [];
  let interpreter: string | undefined;
  let gnuBuildId: string | undefined;
  let goBuildId: string | undefined;
  let hasNxStack: boolean | undefined;
  let hasRelro = false;

  if (ePhnum > 0) {
    const phTableSize = checkedMul(ePhnum, ePhentsize, "Program header table");
    assertWithinBounds(source.size, ePhoff, phTableSize, "ELF program header table");
    const phBytes = await source.read(ePhoff, phTableSize);
    const phView = createDataView(phBytes);
    for (let i = 0; i < ePhnum; i += 1) {
      const base = i * ePhentsize;
      const pType = phView.getUint32(base, le);
      const pFlags = is64 ? phView.getUint32(base + 4, le) : phView.getUint32(base + 24, le);
      const pOffset = bigIntToSafeNumber(is64 ? phView.getBigUint64(base + 8, le) : BigInt(phView.getUint32(base + 4, le)), "p_offset");
      const pVaddr = is64 ? phView.getBigUint64(base + 16, le) : BigInt(phView.getUint32(base + 8, le));
      const pFilesz = bigIntToSafeNumber(is64 ? phView.getBigUint64(base + 32, le) : BigInt(phView.getUint32(base + 16, le)), "p_filesz");
      const pMemsz = is64 ? phView.getBigUint64(base + 40, le) : BigInt(phView.getUint32(base + 20, le));

      let detail = "";
      if (pType === 3 && pFilesz > 0 && pFilesz <= 4096 && pOffset + pFilesz <= source.size) {
        interpreter = readCString(await source.read(pOffset, pFilesz), 0, pFilesz);
        detail = interpreter;
      } else if (pType === 4 && pFilesz > 0 && pFilesz <= MAX_NOTE_BYTES && pOffset + pFilesz <= source.size) {
        const noteInfo = parseElfNoteBuildId(await source.read(pOffset, pFilesz), le);
        if (noteInfo.gnuBuildId) gnuBuildId ??= noteInfo.gnuBuildId;
        if (noteInfo.goBuildId) goBuildId ??= noteInfo.goBuildId;
      } else if (pType === 0x6474e551) {
        hasNxStack = (pFlags & 1) === 0;
        detail = hasNxStack ? "Non-executable stack" : "Executable stack";
      } else if (pType === 0x6474e552) {
        hasRelro = true;
      }

      segments.push({
        name: PH_TYPES[pType] ?? formatHex(pType, 8),
        flags: formatSegmentFlags(pFlags),
        offset: formatHex(pOffset),
        virtualAddress: formatHex(pVaddr),
        fileSize: String(pFilesz),
        memorySize: String(pMemsz),
        detail,
      });
    }
  }

  // Handle extended section count / shstrndx when e_shnum == 0 and e_shoff != 0
  const minShEntSize = is64 ? 64 : 40;
  if (eShoff !== 0 && eShentsize >= minShEntSize && eShnum === 0) {
    assertWithinBounds(source.size, eShoff, eShentsize, "ELF section 0");
    const sec0 = createDataView(await source.read(eShoff, eShentsize));
    const realShnum = bigIntToSafeNumber(is64 ? sec0.getBigUint64(32, le) : BigInt(sec0.getUint32(20, le)), "sh_size");
    eShnum = realShnum;
    if (eShstrndx === 0xffff) eShstrndx = sec0.getUint32(is64 ? 40 : 24, le);
  }

  if (eShnum > MAX_SECTIONS) resourceLimit("ELF section count exceeds browser limit.");
  const rawSections: RawSection[] = [];
  if (eShnum > 0 && eShoff !== 0) {
    if (eShentsize < minShEntSize) invalidFile("ELF section header entry size is invalid.");
    const shTableSize = checkedMul(eShnum, eShentsize, "Section header table");
    assertWithinBounds(source.size, eShoff, shTableSize, "ELF section header table");
    const shBytes = await source.read(eShoff, shTableSize);
    const shView = createDataView(shBytes);

    for (let i = 0; i < eShnum; i += 1) {
      const base = i * eShentsize;
      const nameOffset = shView.getUint32(base, le);
      const type = shView.getUint32(base + 4, le);
      const flags = is64 ? shView.getBigUint64(base + 8, le) : BigInt(shView.getUint32(base + 8, le));
      const addr = is64 ? shView.getBigUint64(base + 16, le) : BigInt(shView.getUint32(base + 12, le));
      const offset = bigIntToSafeNumber(is64 ? shView.getBigUint64(base + 24, le) : BigInt(shView.getUint32(base + 16, le)), "sh_offset");
      const size = bigIntToSafeNumber(is64 ? shView.getBigUint64(base + 32, le) : BigInt(shView.getUint32(base + 20, le)), "sh_size");
      const link = shView.getUint32(is64 ? base + 40 : base + 24, le);
      const entsize = bigIntToSafeNumber(is64 ? shView.getBigUint64(base + 56, le) : BigInt(shView.getUint32(base + 36, le)), "sh_entsize");
      rawSections.push({ index: i, nameOffset, name: "", type, flags, addr, offset, size, link, entsize });
    }

    if (eShstrndx > 0 && eShstrndx < rawSections.length) {
      const shstrSec = rawSections[eShstrndx];
      if (shstrSec.type === 3 && shstrSec.offset + shstrSec.size <= source.size) {
        const strtab = await readBoundedStringTable(source, shstrSec.offset, shstrSec.size);
        for (const sec of rawSections) {
          sec.name = readCString(strtab.bytes, sec.nameOffset, 512) || `section_${sec.index}`;
        }
      }
    }
  }

  let hasGoHint = Boolean(goBuildId);
  let hasRustHint = false;
  for (const sec of rawSections) {
    if (sec.name === ".gopclntab" || sec.name === ".note.go.buildid") hasGoHint = true;
    if (sec.name === ".rustc") hasRustHint = true;
    if (sec.type === 7 && sec.size > 0 && sec.size <= MAX_NOTE_BYTES && sec.offset + sec.size <= source.size) {
      const noteInfo = parseElfNoteBuildId(await source.read(sec.offset, sec.size), le);
      if (noteInfo.gnuBuildId) gnuBuildId ??= noteInfo.gnuBuildId;
      if (noteInfo.goBuildId) {
        goBuildId ??= noteInfo.goBuildId;
        hasGoHint = true;
      }
    }
  }

  const dependencies: DependencyEntry[] = [];
  for (const sec of rawSections) {
    if (sec.type !== 6 || sec.size <= 0 || sec.offset + sec.size > source.size) continue;
    const dynStrSec = sec.link < rawSections.length ? rawSections[sec.link] : undefined;
    const dynStr = dynStrSec && dynStrSec.type === 3
      ? (await readBoundedStringTable(source, dynStrSec.offset, dynStrSec.size)).bytes
      : new Uint8Array(0);
    const entrySize = is64 ? 16 : 8;
    const count = Math.min(Math.floor(sec.size / entrySize), MAX_DYNAMIC_ENTRIES);
    const dynBytes = await source.read(sec.offset, count * entrySize);
    const dynView = createDataView(dynBytes);
    for (let i = 0; i < count; i += 1) {
      const tag = is64 ? Number(dynView.getBigInt64(i * entrySize, le)) : dynView.getInt32(i * entrySize, le);
      if (tag === 0) break;
      const val = is64 ? bigIntToSafeNumber(dynView.getBigUint64(i * entrySize + 8, le), "d_val") : dynView.getUint32(i * entrySize + 4, le);
      if (tag === 1) dependencies.push({ kind: "DT_NEEDED", name: readCString(dynStr, val), detail: "Shared library dependency" });
      else if (tag === 14) dependencies.push({ kind: "DT_SONAME", name: readCString(dynStr, val), detail: "Shared object name" });
      else if (tag === 15) dependencies.push({ kind: "DT_RPATH", name: readCString(dynStr, val), detail: "Legacy library search path" });
      else if (tag === 29) dependencies.push({ kind: "DT_RUNPATH", name: readCString(dynStr, val), detail: "Runtime library search path" });
    }
  }

  const symbols: SymbolEntry[] = [];
  let totalSymbols = 0;
  let symbolsTruncated = false;
  const symEntrySize = is64 ? 24 : 16;
  for (const sec of rawSections) {
    if ((sec.type !== 2 && sec.type !== 11) || sec.size <= 0 || sec.offset + sec.size > source.size) continue;
    const stride = sec.entsize >= symEntrySize ? sec.entsize : symEntrySize;
    const count = Math.floor(sec.size / stride);
    totalSymbols += count;
    const remaining = MAX_SYMBOLS_PARSED - symbols.length;
    if (remaining <= 0) {
      symbolsTruncated = true;
      continue;
    }
    const toRead = Math.min(count, remaining);
    if (toRead < count) symbolsTruncated = true;
    const strSec = sec.link < rawSections.length ? rawSections[sec.link] : undefined;
    const strTable = strSec && strSec.type === 3
      ? await readBoundedStringTable(source, strSec.offset, strSec.size)
      : { bytes: new Uint8Array(0), truncated: false };
    if (strTable.truncated) symbolsTruncated = true;
    const symBytes = await source.read(sec.offset, toRead * stride);
    const symView = createDataView(symBytes);

    for (let i = 0; i < toRead; i += 1) {
      const base = i * stride;
      const stName = symView.getUint32(base, le);
      const stInfo = symView.getUint8(is64 ? base + 4 : base + 12);
      const stShndx = symView.getUint16(is64 ? base + 6 : base + 14, le);
      const stValue = is64 ? symView.getBigUint64(base + 8, le) : BigInt(symView.getUint32(base + 4, le));
      const stSize = is64 ? symView.getBigUint64(base + 16, le) : BigInt(symView.getUint32(base + 8, le));
      const name = readCString(strTable.bytes, stName, 512);
      if (i === 0 && !name) continue;
      if (name.startsWith("_RNv") || name.startsWith("_ZN")) hasRustHint = true;
      if (name.startsWith("runtime.") || name.startsWith("go:")) hasGoHint = true;
      symbols.push({
        name: name || "(unnamed)",
        kind: SYM_TYPES[stInfo & 0x0f] ?? `0x${(stInfo & 0x0f).toString(16)}`,
        binding: SYM_BINDINGS[stInfo >> 4] ?? String(stInfo >> 4),
        section: formatSymSection(stShndx),
        value: formatHex(stValue),
        size: String(stSize),
      });
    }
  }

  const sections: SectionEntry[] = rawSections.map((sec) => ({
    index: sec.index,
    name: sec.name || "(unnamed)",
    type: SH_TYPES[sec.type] ?? formatHex(sec.type, 8),
    flags: formatSectionFlags(sec.flags),
    address: formatHex(sec.addr),
    offset: formatHex(sec.offset),
    size: sec.size,
  }));

  const arch = ELF_MACHINES[eMachine] ?? `Machine ${formatHex(eMachine)}`;
  const kind = ELF_TYPES[eType] ?? `Type ${formatHex(eType)}`;
  const metadata: KeyValueRow[] = [
    { key: "Format", value: is64 ? "ELF64" : "ELF32" },
    { key: "OS / ABI", value: ELF_OSABI[head[7]] ?? `ABI ${head[7]}` },
    { key: "Flags", value: formatHex(eFlags) },
    { key: "Program headers", value: String(ePhnum) },
    { key: "Section headers", value: String(eShnum) },
  ];
  if (interpreter) metadata.push({ key: "Dynamic linker", value: interpreter });
  if (gnuBuildId) metadata.push({ key: "GNU Build ID", value: gnuBuildId });
  if (goBuildId) metadata.push({ key: "Go Build ID", value: goBuildId });
  if (hasNxStack !== undefined) metadata.push({ key: "GNU Stack", value: hasNxStack ? "NX (non-executable)" : "Executable" });
  if (hasRelro) metadata.push({ key: "RELRO", value: "Present" });
  if (hasGoHint) metadata.push({ key: "Toolchain hint", value: "Go binary" });
  else if (hasRustHint) metadata.push({ key: "Toolchain hint", value: "Rust / C++ mangled symbols" });

  if (rawSections.length === 0) notices.push("Section headers are stripped or absent.");
  if (symbolsTruncated) notices.push(`Displayed ${symbols.length} of ${totalSymbols} symbols (browser display cap).`);

  return {
    label: `${is64 ? "ELF64" : "ELF32"} · ${arch}`,
    architecture: arch,
    kind,
    endianness: le ? "Little-endian" : "Big-endian",
    entryPoint: formatHex(eEntry),
    metadata,
    segments,
    sections,
    dependencies,
    symbols,
    totalSymbols,
    symbolsTruncated,
    notices,
  };
}
