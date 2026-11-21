import type { ByteSource } from "@anyfile/dev-binary-core";

import {
  MAX_FAT_ARCHS,
  MAX_LOAD_COMMANDS,
  MAX_SECTIONS,
  MAX_SIZEOF_CMDS,
  MAX_SYMBOLS_PARSED,
  assertWithinBounds,
  bigIntToSafeNumber,
  checkedAdd,
  createDataView,
  formatHex,
  invalidFile,
  readBoundedStringTable,
  readCString,
  readFixedAscii,
  resourceLimit,
  sanitizeEmbeddedPath,
} from "./limits";
import type {
  BinarySliceReport,
  DependencyEntry,
  KeyValueRow,
  SectionEntry,
  SegmentEntry,
  SymbolEntry,
} from "./model";

const MACHO_FILE_TYPES: Record<number, string> = {
  1: "MH_OBJECT (Relocatable)",
  2: "MH_EXECUTE (Executable)",
  3: "MH_FVMLIB (Fixed VM lib)",
  4: "MH_CORE (Core dump)",
  5: "MH_PRELOAD (Preloaded executable)",
  6: "MH_DYLIB (Dynamic library)",
  7: "MH_DYLINKER (Dynamic linker)",
  8: "MH_BUNDLE (Bundle / plugin)",
  9: "MH_DYLIB_STUB",
  10: "MH_DSYM (Debug symbols)",
  11: "MH_KEXT_BUNDLE",
  12: "MH_FILESET",
};

const PLATFORMS: Record<number, string> = {
  1: "macOS",
  2: "iOS",
  3: "tvOS",
  4: "watchOS",
  5: "bridgeOS",
  6: "Mac Catalyst",
  7: "iOS Simulator",
  8: "tvOS Simulator",
  9: "watchOS Simulator",
  10: "DriverKit",
  11: "visionOS",
  12: "visionOS Simulator",
};

function formatCpuType(cpuType: number, cpuSubtype: number): string {
  const baseSub = cpuSubtype & 0x00ff_ffff;
  if (cpuType === 0x0100_000c) return baseSub === 2 ? "ARM64e (arm64e)" : "ARM64 (aarch64)";
  if (cpuType === 0x0200_000c) return "ARM64_32";
  if (cpuType === 0x0100_0007) return "x86-64 (x86_64)";
  if (cpuType === 7) return "x86 (i386)";
  if (cpuType === 12) return "ARM";
  if (cpuType === 18) return "PowerPC";
  if (cpuType === 0x0100_0012) return "PowerPC64";
  return `CPU ${formatHex(cpuType >>> 0)}`;
}

function formatProt(prot: number): string {
  return `${(prot & 1) !== 0 ? "R" : "-"}${(prot & 2) !== 0 ? "W" : "-"}${(prot & 4) !== 0 ? "X" : "-"}`;
}

function formatVersion32(packed: number): string {
  return `${(packed >>> 16) & 0xffff}.${(packed >>> 8) & 0xff}.${packed & 0xff}`;
}

function formatMachOFlags(flags: number): string {
  const out: string[] = [];
  if ((flags & 0x1) !== 0) out.push("NOUNDEFS");
  if ((flags & 0x4) !== 0) out.push("DYLDLINK");
  if ((flags & 0x80) !== 0) out.push("TWOLEVEL");
  if ((flags & 0x20_0000) !== 0) out.push("PIE");
  if ((flags & 0x0100_0000) !== 0) out.push("NO_HEAP_EXECUTION");
  return out.join(", ") || formatHex(flags >>> 0);
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function formatNlistType(nType: number): { kind: string; binding: string } {
  if ((nType & 0xe0) !== 0) return { kind: "STAB", binding: "DEBUG" };
  const ext = (nType & 0x01) !== 0 ? "EXTERNAL" : "LOCAL";
  const base = nType & 0x0e;
  if (base === 0x00) return { kind: "UNDEF", binding: ext };
  if (base === 0x02) return { kind: "ABS", binding: ext };
  if (base === 0x0e) return { kind: "SECT", binding: ext };
  if (base === 0x0c) return { kind: "PBUD", binding: ext };
  if (base === 0x0a) return { kind: "INDR", binding: ext };
  return { kind: formatHex(base), binding: ext };
}

export async function parseMachOSlice(
  source: ByteSource,
  sliceOffset: number,
  sliceSize: number,
): Promise<BinarySliceReport> {
  if (sliceSize < 28) invalidFile("Mach-O slice header is truncated.");
  assertWithinBounds(source.size, sliceOffset, sliceSize, "Mach-O slice");
  const head = await source.read(sliceOffset, Math.min(sliceSize, 32));
  const beMagic = createDataView(head).getUint32(0, false);

  let is64 = false;
  let le = true;
  if (beMagic === 0xfeedface) {
    is64 = false;
    le = false;
  } else if (beMagic === 0xcefaedfe) {
    is64 = false;
    le = true;
  } else if (beMagic === 0xfeedfacf) {
    is64 = true;
    le = false;
  } else if (beMagic === 0xcffaedfe) {
    is64 = true;
    le = true;
  } else {
    invalidFile(`Invalid Mach-O magic ${formatHex(beMagic)}.`);
  }

  const headerSize = is64 ? 32 : 28;
  if (sliceSize < headerSize) invalidFile("Mach-O header is truncated.");
  const view = createDataView(head);
  const cpuType = view.getInt32(4, le);
  const cpuSubtype = view.getInt32(8, le);
  const fileType = view.getUint32(12, le);
  const ncmds = view.getUint32(16, le);
  const sizeofcmds = view.getUint32(20, le);
  const flags = view.getUint32(24, le);

  if (ncmds > MAX_LOAD_COMMANDS) resourceLimit("Mach-O load command count exceeds browser limit.");
  if (sizeofcmds > MAX_SIZEOF_CMDS) resourceLimit("Mach-O load commands exceed browser limit.");
  if (headerSize + sizeofcmds > sliceSize) invalidFile("Mach-O load commands extend past the slice.");

  const cmdBytes = sizeofcmds > 0 ? await source.read(checkedAdd(sliceOffset, headerSize), sizeofcmds) : new Uint8Array(0);
  const cmdView = createDataView(cmdBytes);

  const arch = formatCpuType(cpuType, cpuSubtype);
  const kind = MACHO_FILE_TYPES[fileType] ?? `FileType ${fileType}`;
  const segments: SegmentEntry[] = [];
  const sections: SectionEntry[] = [];
  const dependencies: DependencyEntry[] = [];
  const notices: string[] = [];
  const metadata: KeyValueRow[] = [
    { key: "Format", value: is64 ? "Mach-O 64-bit" : "Mach-O 32-bit" },
    { key: "Load commands", value: `${ncmds} (${sizeofcmds} bytes)` },
    { key: "Flags", value: formatMachOFlags(flags) },
  ];

  let entryPoint = "N/A";
  let symtabInfo: { symoff: number; nsyms: number; stroff: number; strsize: number } | undefined;
  let pos = 0;

  for (let i = 0; i < ncmds; i += 1) {
    if (pos + 8 > cmdBytes.length) invalidFile("Mach-O load command header is truncated.");
    const cmd = cmdView.getUint32(pos, le);
    const cmdsize = cmdView.getUint32(pos + 4, le);
    if (cmdsize < 8 || pos + cmdsize > cmdBytes.length) invalidFile("Mach-O load command size is invalid.");

    if (cmd === 0x1 || cmd === 0x19) {
      const seg64 = cmd === 0x19;
      const minSegSize = seg64 ? 72 : 56;
      if (cmdsize < minSegSize) invalidFile("Mach-O segment command is truncated.");
      const segName = readFixedAscii(cmdBytes, pos + 8, 16) || "(unnamed)";
      const vmaddr = seg64 ? cmdView.getBigUint64(pos + 24, le) : BigInt(cmdView.getUint32(pos + 24, le));
      const vmsize = seg64 ? cmdView.getBigUint64(pos + 32, le) : BigInt(cmdView.getUint32(pos + 28, le));
      const fileoff = seg64 ? cmdView.getBigUint64(pos + 40, le) : BigInt(cmdView.getUint32(pos + 32, le));
      const filesize = seg64 ? cmdView.getBigUint64(pos + 48, le) : BigInt(cmdView.getUint32(pos + 36, le));
      const maxprot = cmdView.getUint32(pos + (seg64 ? 56 : 40), le);
      const initprot = cmdView.getUint32(pos + (seg64 ? 60 : 44), le);
      const nsects = cmdView.getUint32(pos + (seg64 ? 64 : 48), le);
      if (sections.length + nsects > MAX_SECTIONS) resourceLimit("Mach-O section count exceeds browser limit.");

      segments.push({
        name: segName,
        flags: `${formatProt(initprot)} / max ${formatProt(maxprot)}`,
        offset: formatHex(fileoff),
        virtualAddress: formatHex(vmaddr),
        fileSize: String(filesize),
        memorySize: String(vmsize),
        detail: `${nsects} section(s)`,
      });

      const sectSize = seg64 ? 80 : 68;
      let secPos = pos + minSegSize;
      for (let s = 0; s < nsects; s += 1) {
        if (secPos + sectSize > pos + cmdsize) invalidFile("Mach-O section header is truncated.");
        const sectName = readFixedAscii(cmdBytes, secPos, 16);
        const ownerSeg = readFixedAscii(cmdBytes, secPos + 16, 16);
        const addr = seg64 ? cmdView.getBigUint64(secPos + 32, le) : BigInt(cmdView.getUint32(secPos + 32, le));
        const size = bigIntToSafeNumber(seg64 ? cmdView.getBigUint64(secPos + 40, le) : BigInt(cmdView.getUint32(secPos + 36, le)), "section size");
        const offset = cmdView.getUint32(secPos + (seg64 ? 48 : 40), le);
        const secFlags = cmdView.getUint32(secPos + (seg64 ? 64 : 56), le);
        sections.push({
          index: sections.length + 1,
          name: `${ownerSeg},${sectName}`,
          type: formatHex(secFlags & 0xff),
          flags: formatHex((secFlags >>> 8) & 0xffffff),
          address: formatHex(addr),
          offset: formatHex(offset),
          size,
        });
        secPos += sectSize;
      }
    } else if (cmd === 0x0c || cmd === 0x0d || cmd === 0x8000_0018 || cmd === 0x8000_001f || cmd === 0x20 || cmd === 0x8000_0023) {
      if (cmdsize >= 24) {
        const strOff = cmdView.getUint32(pos + 8, le);
        const curVer = formatVersion32(cmdView.getUint32(pos + 16, le));
        const compatVer = formatVersion32(cmdView.getUint32(pos + 20, le));
        const dylibName = strOff >= 24 && strOff < cmdsize
          ? sanitizeEmbeddedPath(readCString(cmdBytes, pos + strOff, cmdsize - strOff))
          : "(invalid offset)";
        const depKind = cmd === 0x0d ? "LC_ID_DYLIB"
          : cmd === 0x8000_0018 ? "LC_LOAD_WEAK_DYLIB"
            : cmd === 0x8000_001f ? "LC_REEXPORT_DYLIB"
              : cmd === 0x20 ? "LC_LAZY_LOAD_DYLIB"
                : cmd === 0x8000_0023 ? "LC_LOAD_UPWARD_DYLIB"
                  : "LC_LOAD_DYLIB";
        dependencies.push({
          kind: depKind,
          name: dylibName,
          detail: `current ${curVer}, compat ${compatVer}`,
        });
      }
    } else if (cmd === 0x8000_001c && cmdsize >= 12) {
      const strOff = cmdView.getUint32(pos + 8, le);
      if (strOff >= 12 && strOff < cmdsize) {
        dependencies.push({
          kind: "LC_RPATH",
          name: sanitizeEmbeddedPath(readCString(cmdBytes, pos + strOff, cmdsize - strOff)),
          detail: "Runtime search path",
        });
      }
    } else if (cmd === 0x0e && cmdsize >= 12) {
      const strOff = cmdView.getUint32(pos + 8, le);
      if (strOff >= 12 && strOff < cmdsize) {
        metadata.push({ key: "Dynamic linker", value: readCString(cmdBytes, pos + strOff, cmdsize - strOff) });
      }
    } else if (cmd === 0x1b && cmdsize >= 24) {
      metadata.push({ key: "UUID", value: formatUuid(cmdBytes.subarray(pos + 8, pos + 24)) });
    } else if (cmd === 0x8000_0028 && cmdsize >= 24) {
      const entryOff = cmdView.getBigUint64(pos + 8, le);
      entryPoint = `file+${formatHex(entryOff)}`;
    } else if (cmd === 0x32 && cmdsize >= 24) {
      const platform = cmdView.getUint32(pos + 8, le);
      const minos = formatVersion32(cmdView.getUint32(pos + 12, le));
      const sdk = formatVersion32(cmdView.getUint32(pos + 16, le));
      metadata.push({
        key: "Build platform",
        value: `${PLATFORMS[platform] ?? `Platform ${platform}`} · min ${minos} · SDK ${sdk}`,
      });
    } else if ((cmd === 0x24 || cmd === 0x25 || cmd === 0x2f || cmd === 0x30) && cmdsize >= 16) {
      const minos = formatVersion32(cmdView.getUint32(pos + 8, le));
      const sdk = formatVersion32(cmdView.getUint32(pos + 12, le));
      metadata.push({ key: "Min OS version", value: `${minos} (SDK ${sdk})` });
    } else if (cmd === 0x1d && cmdsize >= 16) {
      const sigSize = cmdView.getUint32(pos + 12, le);
      metadata.push({ key: "Code signature", value: `Present (${sigSize} bytes)` });
    } else if (cmd === 0x02 && cmdsize >= 24) {
      symtabInfo = {
        symoff: cmdView.getUint32(pos + 8, le),
        nsyms: cmdView.getUint32(pos + 12, le),
        stroff: cmdView.getUint32(pos + 16, le),
        strsize: cmdView.getUint32(pos + 20, le),
      };
    } else if (cmd === 0x8000_0033 && cmdsize >= 16) {
      metadata.push({ key: "Dyld exports trie", value: `${cmdView.getUint32(pos + 12, le)} bytes` });
    } else if (cmd === 0x8000_0034 && cmdsize >= 16) {
      metadata.push({ key: "Chained fixups", value: `${cmdView.getUint32(pos + 12, le)} bytes` });
    }

    pos += cmdsize;
  }

  const symbols: SymbolEntry[] = [];
  let totalSymbols = 0;
  let symbolsTruncated = false;

  if (symtabInfo && symtabInfo.nsyms > 0) {
    const nlistSize = is64 ? 16 : 12;
    totalSymbols = symtabInfo.nsyms;
    if (symtabInfo.symoff + symtabInfo.nsyms * nlistSize <= sliceSize && symtabInfo.stroff + symtabInfo.strsize <= sliceSize) {
      const toRead = Math.min(symtabInfo.nsyms, MAX_SYMBOLS_PARSED);
      if (toRead < symtabInfo.nsyms) symbolsTruncated = true;
      const strRes = await readBoundedStringTable(source, checkedAdd(sliceOffset, symtabInfo.stroff), symtabInfo.strsize);
      if (strRes.truncated) symbolsTruncated = true;
      const symBytes = await source.read(checkedAdd(sliceOffset, symtabInfo.symoff), toRead * nlistSize);
      const symView = createDataView(symBytes);
      for (let i = 0; i < toRead; i += 1) {
        const base = i * nlistSize;
        const strx = symView.getUint32(base, le);
        const nType = symView.getUint8(base + 4);
        const nSect = symView.getUint8(base + 5);
        const nValue = is64 ? symView.getBigUint64(base + 8, le) : BigInt(symView.getUint32(base + 8, le));
        const parsedType = formatNlistType(nType);
        symbols.push({
          name: readCString(strRes.bytes, strx, 512) || "(unnamed)",
          kind: parsedType.kind,
          binding: parsedType.binding,
          section: nSect === 0 ? "NO_SECT" : String(nSect),
          value: formatHex(nValue),
        });
      }
    }
  }

  if (symbolsTruncated) notices.push(`Displayed ${symbols.length} of ${totalSymbols} symbols (browser display cap).`);

  return {
    label: `${is64 ? "Mach-O 64" : "Mach-O 32"} · ${arch}`,
    architecture: arch,
    kind,
    endianness: le ? "Little-endian" : "Big-endian",
    entryPoint,
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

export async function parseMachOOrFat(source: ByteSource): Promise<{ isFat: boolean; slices: BinarySliceReport[] }> {
  if (source.size < 8) invalidFile("Mach-O header is truncated.");
  const head = await source.read(0, 8);
  const magic = createDataView(head).getUint32(0, false);
  const isFatBe = magic === 0xcafebabe || magic === 0xcafebabf;
  const isFatLe = magic === 0xbebafeca || magic === 0xbfbafeca;
  if (!isFatBe && !isFatLe) {
    return { isFat: false, slices: [await parseMachOSlice(source, 0, source.size)] };
  }

  const isFat64 = magic === 0xcafebabf || magic === 0xbfbafeca;
  const le = isFatLe;
  const nfat = createDataView(head).getUint32(4, le);
  if (nfat < 1 || nfat > MAX_FAT_ARCHS) resourceLimit("Universal binary architecture count exceeds browser limit.");

  const entrySize = isFat64 ? 32 : 20;
  const headerEnd = 8 + nfat * entrySize;
  assertWithinBounds(source.size, 8, nfat * entrySize, "Mach-O fat arch table");
  const archBytes = await source.read(8, nfat * entrySize);
  const archView = createDataView(archBytes);

  const slices: BinarySliceReport[] = [];
  for (let i = 0; i < nfat; i += 1) {
    const base = i * entrySize;
    const offset = isFat64
      ? bigIntToSafeNumber(archView.getBigUint64(base + 8, le), "fat_arch.offset")
      : archView.getUint32(base + 8, le);
    const size = isFat64
      ? bigIntToSafeNumber(archView.getBigUint64(base + 16, le), "fat_arch.size")
      : archView.getUint32(base + 12, le);
    if (offset < headerEnd) invalidFile("Universal binary slice overlaps fat header.");
    assertWithinBounds(source.size, offset, size, `Universal binary slice ${i}`);
    const slice = await parseMachOSlice(source, offset, size);
    slices.push({
      ...slice,
      label: `Slice ${i + 1}: ${slice.architecture} (${size} bytes)`,
    });
  }
  return { isFat: true, slices };
}
