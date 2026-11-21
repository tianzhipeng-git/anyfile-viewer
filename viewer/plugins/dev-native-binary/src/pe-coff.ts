import type { ByteSource } from "@anyfile/dev-binary-core";

import {
  MAX_DEBUG_ENTRIES,
  MAX_DYNAMIC_ENTRIES,
  MAX_IMPORTS_PER_DLL,
  MAX_SECTIONS,
  MAX_SYMBOLS_PARSED,
  assertWithinBounds,
  checkedAdd,
  checkedMul,
  createDataView,
  formatHex,
  invalidFile,
  readBoundedStringTable,
  readCString,
  readFixedAscii,
  resourceLimit,
  sanitizeEmbeddedPath,
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

const PE_MACHINES: Record<number, string> = {
  0x014c: "x86 (i386)",
  0x01c0: "ARM",
  0x01c4: "ARMv7 Thumb-2",
  0x0200: "IA-64",
  0x5032: "RISC-V 32",
  0x5064: "RISC-V 64",
  0x6232: "LoongArch32",
  0x6264: "LoongArch64",
  0x8664: "x86-64 (AMD64)",
  0xaa64: "ARM64 (AArch64)",
};

const PE_SUBSYSTEMS: Record<number, string> = {
  0: "Unknown",
  1: "Native",
  2: "Windows GUI",
  3: "Windows Console (CUI)",
  5: "OS/2 CUI",
  7: "POSIX CUI",
  9: "Windows CE GUI",
  10: "EFI Application",
  11: "EFI Boot Service Driver",
  12: "EFI Runtime Driver",
  14: "Xbox",
  16: "Windows Boot Application",
};

const DEBUG_TYPES: Record<number, string> = {
  1: "COFF",
  2: "CODEVIEW",
  3: "FPO",
  4: "MISC",
  12: "POGO",
  13: "ILTCG",
  16: "REPRO",
  20: "EX_DLLCHARACTERISTICS",
};

const DATA_DIR_NAMES = [
  "Export", "Import", "Resource", "Exception", "Certificate", "BaseReloc",
  "Debug", "Architecture", "GlobalPtr", "TLS", "LoadConfig", "BoundImport",
  "IAT", "DelayImport", "CLR Runtime", "Reserved",
];

type RawPeSection = {
  index: number;
  name: string;
  virtualSize: number;
  virtualAddress: number;
  sizeOfRawData: number;
  pointerToRawData: number;
  characteristics: number;
};

type DataDir = { virtualAddress: number; size: number };

function formatCharacteristics(value: number): string {
  const flags: string[] = [];
  if ((value & 0x0020) !== 0) flags.push("CODE");
  if ((value & 0x0040) !== 0) flags.push("DATA");
  if ((value & 0x0080) !== 0) flags.push("BSS");
  if ((value & 0x20000000) !== 0) flags.push("X");
  if ((value & 0x40000000) !== 0) flags.push("R");
  if ((value & 0x80000000) !== 0) flags.push("W");
  return flags.join("|") || "-";
}

function formatDllCharacteristics(value: number): string {
  const flags: string[] = [];
  if ((value & 0x0020) !== 0) flags.push("HIGH_ENTROPY_VA");
  if ((value & 0x0040) !== 0) flags.push("DYNAMIC_BASE(ASLR)");
  if ((value & 0x0100) !== 0) flags.push("NX_COMPAT(DEP)");
  if ((value & 0x4000) !== 0) flags.push("GUARD_CF");
  return flags.join(", ") || "None";
}

function rvaToOffset(rva: number, sections: readonly RawPeSection[], sizeOfHeaders: number): number | undefined {
  if (rva === 0) return undefined;
  for (const sec of sections) {
    const span = Math.max(sec.virtualSize, sec.sizeOfRawData);
    if (span > 0 && rva >= sec.virtualAddress && rva < sec.virtualAddress + span) {
      const delta = rva - sec.virtualAddress;
      if (delta >= sec.sizeOfRawData && sec.sizeOfRawData > 0) return undefined;
      return checkedAdd(sec.pointerToRawData, delta, "RVA offset");
    }
  }
  return rva < sizeOfHeaders ? rva : undefined;
}

async function readRvaCString(
  source: ByteSource,
  rva: number,
  sections: readonly RawPeSection[],
  sizeOfHeaders: number,
  maxBytes = 512,
): Promise<string> {
  const offset = rvaToOffset(rva, sections, sizeOfHeaders);
  if (offset === undefined || offset >= source.size) return "";
  const len = Math.min(maxBytes, source.size - offset);
  return readCString(await source.read(offset, len), 0, len);
}

function resolveCoffName(bytes: Uint8Array, offset: number, strTable: Uint8Array): string {
  const raw = readFixedAscii(bytes, offset, 8);
  if (raw.startsWith("/") && strTable.length > 0) {
    const strOff = Number(raw.slice(1));
    if (Number.isSafeInteger(strOff) && strOff >= 4 && strOff < strTable.length) {
      return readCString(strTable, strOff, 512) || raw;
    }
  }
  return raw || "(unnamed)";
}

async function parseCoffStringTable(
  source: ByteSource,
  symPtr: number,
  numSyms: number,
): Promise<Uint8Array> {
  if (symPtr === 0 || numSyms === 0) return new Uint8Array(0);
  const strOffset = symPtr + numSyms * 18;
  if (!Number.isSafeInteger(strOffset) || strOffset + 4 > source.size) return new Uint8Array(0);
  const sizeView = createDataView(await source.read(strOffset, 4));
  const strSize = sizeView.getUint32(0, true);
  if (strSize < 4 || strOffset + strSize > source.size) return new Uint8Array(0);
  return (await readBoundedStringTable(source, strOffset, strSize)).bytes;
}

function formatRsdsGuid(bytes: Uint8Array): string {
  const view = createDataView(bytes);
  const d1 = view.getUint32(0, true).toString(16).padStart(8, "0");
  const d2 = view.getUint16(4, true).toString(16).padStart(4, "0");
  const d3 = view.getUint16(6, true).toString(16).padStart(4, "0");
  const d4 = toHexBytes(bytes.subarray(8, 10));
  const d5 = toHexBytes(bytes.subarray(10, 16));
  return `${d1}-${d2}-${d3}-${d4}-${d5}`.toUpperCase();
}

export async function parsePeOrCoff(source: ByteSource): Promise<BinarySliceReport> {
  if (source.size < 20) invalidFile("PE/COFF header is truncated.");
  const head = await source.read(0, Math.min(source.size, 64));
  const isMz = head.length >= 64 && head[0] === 0x4d && head[1] === 0x5a;

  let coffOffset = 0;
  let isPe = false;
  if (isMz) {
    const peOffset = createDataView(head).getUint32(0x3c, true);
    if (peOffset >= 64 && peOffset + 24 <= source.size) {
      const sig = await source.read(peOffset, 4);
      if (sig[0] === 0x50 && sig[1] === 0x45 && sig[2] === 0x00 && sig[3] === 0x00) {
        isPe = true;
        coffOffset = peOffset + 4;
      }
    }
  }
  if (isMz && !isPe) invalidFile("DOS MZ file does not contain a valid PE signature.");

  assertWithinBounds(source.size, coffOffset, 20, "COFF header");
  const coffBytes = await source.read(coffOffset, 20);
  const coffView = createDataView(coffBytes);
  const machine = coffView.getUint16(0, true);
  const numberOfSections = coffView.getUint16(2, true);
  const timeDateStamp = coffView.getUint32(4, true);
  const pointerToSymbolTable = coffView.getUint32(8, true);
  const numberOfSymbols = coffView.getUint32(12, true);
  const sizeOfOptionalHeader = coffView.getUint16(16, true);
  const characteristics = coffView.getUint16(18, true);

  if (numberOfSections > MAX_SECTIONS) resourceLimit("PE/COFF section count exceeds browser limit.");
  if (sizeOfOptionalHeader > 8192) resourceLimit("PE/COFF optional header exceeds browser limit.");

  const optOffset = checkedAdd(coffOffset, 20, "Optional header offset");
  const sectionTableOffset = checkedAdd(optOffset, sizeOfOptionalHeader, "Section table offset");
  const sectionTableBytes = checkedMul(numberOfSections, 40, "Section table size");
  assertWithinBounds(source.size, sectionTableOffset, sectionTableBytes, "PE/COFF section table");

  const arch = PE_MACHINES[machine] ?? `Machine ${formatHex(machine)}`;
  const metadata: KeyValueRow[] = [
    { key: "Machine", value: `${arch} (${formatHex(machine)})` },
    { key: "Sections", value: String(numberOfSections) },
    { key: "Timestamp", value: timeDateStamp ? new Date(timeDateStamp * 1000).toISOString() : "0 (deterministic/unset)" },
  ];

  let is64 = false;
  let entryPointRva = 0;
  let sizeOfHeaders = 0;
  let subsystemName: string | undefined;
  let dllCharacteristics = 0;
  const dataDirs: DataDir[] = [];

  if (isPe) {
    if (sizeOfOptionalHeader < 96) invalidFile("PE optional header is missing or truncated.");
    const optBytes = await source.read(optOffset, sizeOfOptionalHeader);
    const optView = createDataView(optBytes);
    const magic = optView.getUint16(0, true);
    if (magic !== 0x10b && magic !== 0x20b) invalidFile(`Unsupported PE optional header magic ${formatHex(magic)}.`);
    is64 = magic === 0x20b;
    if (is64 && sizeOfOptionalHeader < 112) invalidFile("PE32+ optional header is truncated.");

    entryPointRva = optView.getUint32(16, true);
    const imageBase = is64 ? optView.getBigUint64(24, true) : BigInt(optView.getUint32(28, true));
    const sectionAlign = optView.getUint32(32, true);
    const fileAlign = optView.getUint32(36, true);
    const sizeOfImage = optView.getUint32(56, true);
    sizeOfHeaders = optView.getUint32(60, true);
    const subsystem = optView.getUint16(68, true);
    dllCharacteristics = optView.getUint16(70, true);
    const numDirsOffset = is64 ? 108 : 92;
    const numRvaAndSizes = optView.getUint32(numDirsOffset, true);
    if (numRvaAndSizes > 1024) invalidFile("PE NumberOfRvaAndSizes is invalid.");

    subsystemName = PE_SUBSYSTEMS[subsystem] ?? `Subsystem ${subsystem}`;
    metadata.unshift({ key: "Format", value: is64 ? "PE32+ (64-bit)" : "PE32 (32-bit)" });
    metadata.push(
      { key: "Image base", value: formatHex(imageBase) },
      { key: "Size of image", value: `${sizeOfImage} bytes` },
      { key: "Alignment", value: `section ${formatHex(sectionAlign)} / file ${formatHex(fileAlign)}` },
      { key: "Subsystem", value: subsystemName },
      { key: "Security flags", value: formatDllCharacteristics(dllCharacteristics) },
    );

    const dirBase = numDirsOffset + 4;
    const dirCount = Math.min(numRvaAndSizes, 16, Math.floor((sizeOfOptionalHeader - dirBase) / 8));
    for (let i = 0; i < dirCount; i += 1) {
      dataDirs.push({
        virtualAddress: optView.getUint32(dirBase + i * 8, true),
        size: optView.getUint32(dirBase + i * 8 + 4, true),
      });
    }
  } else {
    metadata.unshift({ key: "Format", value: "COFF Relocatable Object" });
  }

  const coffStrTable = await parseCoffStringTable(source, pointerToSymbolTable, numberOfSymbols);
  const rawSecBytes = numberOfSections > 0 ? await source.read(sectionTableOffset, sectionTableBytes) : new Uint8Array(0);
  const secView = createDataView(rawSecBytes);
  const rawSections: RawPeSection[] = [];
  for (let i = 0; i < numberOfSections; i += 1) {
    const base = i * 40;
    rawSections.push({
      index: i,
      name: resolveCoffName(rawSecBytes, base, coffStrTable),
      virtualSize: secView.getUint32(base + 8, true),
      virtualAddress: secView.getUint32(base + 12, true),
      sizeOfRawData: secView.getUint32(base + 16, true),
      pointerToRawData: secView.getUint32(base + 20, true),
      characteristics: secView.getUint32(base + 36, true),
    });
  }

  const sections: SectionEntry[] = rawSections.map((sec) => ({
    index: sec.index,
    name: sec.name,
    type: isPe ? "PE Section" : "COFF Section",
    flags: formatCharacteristics(sec.characteristics),
    address: formatHex(sec.virtualAddress),
    offset: formatHex(sec.pointerToRawData),
    size: sec.sizeOfRawData || sec.virtualSize,
  }));

  const segments: SegmentEntry[] = [];
  const dependencies: DependencyEntry[] = [];
  const symbols: SymbolEntry[] = [];
  const notices: string[] = [];
  let totalSymbols = 0;
  let symbolsTruncated = false;

  for (let i = 0; i < dataDirs.length; i += 1) {
    const dir = dataDirs[i];
    if (dir.virtualAddress === 0 && dir.size === 0) continue;
    segments.push({
      name: `DataDir: ${DATA_DIR_NAMES[i] ?? `#${i}`}`,
      flags: "-",
      offset: i === 4 ? formatHex(dir.virtualAddress) : formatHex(rvaToOffset(dir.virtualAddress, rawSections, sizeOfHeaders) ?? 0),
      virtualAddress: formatHex(dir.virtualAddress),
      fileSize: String(dir.size),
      memorySize: String(dir.size),
      detail: i === 4 ? "Authenticode certificate table (file offset)" : "",
    });
  }

  // Certificate presence
  if (dataDirs[4] && dataDirs[4].virtualAddress > 0 && dataDirs[4].size > 0) {
    metadata.push({ key: "Authenticode signature", value: `Present (${dataDirs[4].size} bytes)` });
  }

  // CLR / .NET header detection
  if (dataDirs[14] && dataDirs[14].virtualAddress > 0 && dataDirs[14].size >= 72) {
    const clrOff = rvaToOffset(dataDirs[14].virtualAddress, rawSections, sizeOfHeaders);
    if (clrOff !== undefined && clrOff + 16 <= source.size) {
      const clrView = createDataView(await source.read(clrOff, 16));
      const major = clrView.getUint16(4, true);
      const minor = clrView.getUint16(6, true);
      metadata.push({ key: ".NET CLI header", value: `Present (runtime v${major}.${minor})` });
      notices.push("Contains a .NET CLR metadata header (this viewer inspects PE structure only).");
    }
  }

  // Debug directory
  if (dataDirs[6] && dataDirs[6].virtualAddress > 0 && dataDirs[6].size >= 28) {
    const dbgOff = rvaToOffset(dataDirs[6].virtualAddress, rawSections, sizeOfHeaders);
    if (dbgOff !== undefined) {
      const count = Math.min(Math.floor(dataDirs[6].size / 28), MAX_DEBUG_ENTRIES);
      if (dbgOff + count * 28 <= source.size) {
        const dbgBytes = await source.read(dbgOff, count * 28);
        const dbgView = createDataView(dbgBytes);
        for (let i = 0; i < count; i += 1) {
          const base = i * 28;
          const dbgType = dbgView.getUint32(base + 12, true);
          const dbgSize = dbgView.getUint32(base + 16, true);
          const dbgPtr = dbgView.getUint32(base + 24, true);
          if (dbgType === 2 && dbgSize >= 24 && dbgSize <= 4096 && dbgPtr > 0 && dbgPtr + dbgSize <= source.size) {
            const cv = await source.read(dbgPtr, dbgSize);
            if (cv[0] === 0x52 && cv[1] === 0x53 && cv[2] === 0x44 && cv[3] === 0x53) {
              const guid = formatRsdsGuid(cv.subarray(4, 20));
              const age = createDataView(cv).getUint32(20, true);
              const pdbPath = sanitizeEmbeddedPath(readCString(cv, 24, dbgSize - 24));
              metadata.push({ key: "CodeView PDB", value: `${pdbPath} (GUID ${guid}, age ${age})` });
            }
          } else {
            metadata.push({ key: "Debug directory", value: `${DEBUG_TYPES[dbgType] ?? `Type ${dbgType}`} (${dbgSize} bytes)` });
          }
        }
      }
    }
  }

  // Export directory
  if (dataDirs[0] && dataDirs[0].virtualAddress > 0 && dataDirs[0].size >= 40) {
    const expVa = dataDirs[0].virtualAddress;
    const expSize = dataDirs[0].size;
    const expOff = rvaToOffset(expVa, rawSections, sizeOfHeaders);
    if (expOff !== undefined && expOff + 40 <= source.size) {
      const expView = createDataView(await source.read(expOff, 40));
      const dllName = await readRvaCString(source, expView.getUint32(12, true), rawSections, sizeOfHeaders);
      if (dllName) dependencies.push({ kind: "Export Name", name: dllName, detail: "PE Export Directory module name" });
      const ordinalBase = expView.getUint32(16, true);
      const numFuncs = expView.getUint32(20, true);
      const numNames = expView.getUint32(24, true);
      const addrFuncsOff = rvaToOffset(expView.getUint32(28, true), rawSections, sizeOfHeaders);
      const addrNamesOff = rvaToOffset(expView.getUint32(32, true), rawSections, sizeOfHeaders);
      const addrOrdsOff = rvaToOffset(expView.getUint32(36, true), rawSections, sizeOfHeaders);
      totalSymbols += Math.max(numFuncs, numNames);

      if (addrNamesOff !== undefined && addrOrdsOff !== undefined && addrFuncsOff !== undefined) {
        const count = Math.min(numNames, MAX_SYMBOLS_PARSED - symbols.length);
        if (count < numNames) symbolsTruncated = true;
        if (count > 0 && addrNamesOff + count * 4 <= source.size && addrOrdsOff + count * 2 <= source.size) {
          const namesView = createDataView(await source.read(addrNamesOff, count * 4));
          const ordsView = createDataView(await source.read(addrOrdsOff, count * 2));
          for (let i = 0; i < count; i += 1) {
            const nameRva = namesView.getUint32(i * 4, true);
            const ordIdx = ordsView.getUint16(i * 2, true);
            const name = await readRvaCString(source, nameRva, rawSections, sizeOfHeaders);
            let funcRva = 0;
            if (ordIdx < numFuncs && addrFuncsOff + (ordIdx + 1) * 4 <= source.size) {
              funcRva = createDataView(await source.read(addrFuncsOff + ordIdx * 4, 4)).getUint32(0, true);
            }
            const isForwarder = funcRva >= expVa && funcRva < expVa + expSize;
            const forwarder = isForwarder ? await readRvaCString(source, funcRva, rawSections, sizeOfHeaders) : "";
            symbols.push({
              name: name || `#${ordinalBase + ordIdx}`,
              kind: isForwarder ? "FORWARDER" : "EXPORT",
              binding: `Ord ${ordinalBase + ordIdx}`,
              section: isForwarder ? forwarder : "Export",
              value: formatHex(funcRva),
            });
          }
        }
      }
    }
  }

  // Import directory
  if (dataDirs[1] && dataDirs[1].virtualAddress > 0 && dataDirs[1].size >= 20) {
    const impOff = rvaToOffset(dataDirs[1].virtualAddress, rawSections, sizeOfHeaders);
    if (impOff !== undefined) {
      const maxDesc = Math.min(Math.floor(dataDirs[1].size / 20), MAX_DYNAMIC_ENTRIES);
      if (impOff + maxDesc * 20 <= source.size) {
        const impBytes = await source.read(impOff, maxDesc * 20);
        const impView = createDataView(impBytes);
        const thunkSize = is64 ? 8 : 4;
        const zero = BigInt(0);
        const ordinalMask = is64 ? (BigInt(1) << BigInt(63)) : BigInt(0x80000000);
        for (let i = 0; i < maxDesc; i += 1) {
          const base = i * 20;
          const origThunkRva = impView.getUint32(base, true);
          const nameRva = impView.getUint32(base + 12, true);
          const firstThunkRva = impView.getUint32(base + 16, true);
          if (origThunkRva === 0 && nameRva === 0 && firstThunkRva === 0) break;
          const dllName = await readRvaCString(source, nameRva, rawSections, sizeOfHeaders) || "(unknown DLL)";
          const thunkRva = origThunkRva || firstThunkRva;
          let thunkOff = rvaToOffset(thunkRva, rawSections, sizeOfHeaders);
          let importedCount = 0;
          if (thunkOff !== undefined) {
            for (let t = 0; t < MAX_IMPORTS_PER_DLL && thunkOff + thunkSize <= source.size; t += 1) {
              const tView = createDataView(await source.read(thunkOff, thunkSize));
              const rawVal = is64 ? tView.getBigUint64(0, true) : BigInt(tView.getUint32(0, true));
              if (rawVal === zero) break;
              importedCount += 1;
              totalSymbols += 1;
              if (symbols.length < MAX_SYMBOLS_PARSED) {
                if ((rawVal & ordinalMask) !== zero) {
                  symbols.push({
                    name: `Ordinal #${Number(rawVal & BigInt(0xffff))}`,
                    kind: "IMPORT",
                    binding: "ORDINAL",
                    section: dllName,
                    value: "-",
                  });
                } else {
                  const hintRva = Number(rawVal & BigInt(0x7fffffff));
                  const fnName = await readRvaCString(source, hintRva + 2, rawSections, sizeOfHeaders);
                  symbols.push({
                    name: fnName || `(hint RVA ${formatHex(hintRva)})`,
                    kind: "IMPORT",
                    binding: "DYNAMIC",
                    section: dllName,
                    value: formatHex(hintRva),
                  });
                }
              } else {
                symbolsTruncated = true;
              }
              thunkOff += thunkSize;
            }
          }
          dependencies.push({
            kind: "DLL Import",
            name: dllName,
            detail: `${importedCount} imported symbol(s)`,
          });
        }
      }
    }
  }

  // Delay-load imports (DataDir[13])
  if (dataDirs[13] && dataDirs[13].virtualAddress > 0 && dataDirs[13].size >= 32) {
    const delayOff = rvaToOffset(dataDirs[13].virtualAddress, rawSections, sizeOfHeaders);
    if (delayOff !== undefined) {
      const maxDelay = Math.min(Math.floor(dataDirs[13].size / 32), 256);
      if (delayOff + maxDelay * 32 <= source.size) {
        const delayView = createDataView(await source.read(delayOff, maxDelay * 32));
        for (let i = 0; i < maxDelay; i += 1) {
          const dllNameRva = delayView.getUint32(i * 32 + 4, true);
          if (dllNameRva === 0) break;
          const dllName = await readRvaCString(source, dllNameRva, rawSections, sizeOfHeaders);
          if (dllName) dependencies.push({ kind: "Delay-Load DLL", name: dllName, detail: "Loaded lazily at runtime" });
        }
      }
    }
  }

  // Standalone COFF symbol table
  if (!isPe && pointerToSymbolTable > 0 && numberOfSymbols > 0 && pointerToSymbolTable + numberOfSymbols * 18 <= source.size) {
    totalSymbols += numberOfSymbols;
    const maxRaw = Math.min(numberOfSymbols, MAX_SYMBOLS_PARSED * 2);
    const symBytes = await source.read(pointerToSymbolTable, maxRaw * 18);
    const symView = createDataView(symBytes);
    for (let i = 0; i < maxRaw; i += 1) {
      const base = i * 18;
      const zeros = symView.getUint32(base, true);
      const name = zeros === 0
        ? readCString(coffStrTable, symView.getUint32(base + 4, true), 512)
        : readFixedAscii(symBytes, base, 8);
      const value = symView.getUint32(base + 8, true);
      const secNum = symView.getInt16(base + 12, true);
      const storageClass = symView.getUint8(base + 16);
      const auxCount = symView.getUint8(base + 17);
      if (symbols.length < MAX_SYMBOLS_PARSED) {
        symbols.push({
          name: name || "(unnamed)",
          kind: storageClass === 2 ? "EXT" : storageClass === 3 ? "STATIC" : `CLASS_${storageClass}`,
          binding: storageClass === 2 ? "GLOBAL" : "LOCAL",
          section: secNum === 0 ? "UND" : secNum === -1 ? "ABS" : secNum === -2 ? "DEBUG" : String(secNum),
          value: formatHex(value),
        });
      } else {
        symbolsTruncated = true;
      }
      i += auxCount;
    }
    if (maxRaw < numberOfSymbols) symbolsTruncated = true;
  }

  const isDll = (characteristics & 0x2000) !== 0;
  const kind = !isPe
    ? "COFF Object (.obj)"
    : isDll
      ? "PE Dynamic-Link Library (DLL)"
      : "PE Executable";
  if (symbolsTruncated) notices.push(`Displayed ${symbols.length} of ${totalSymbols} symbols (browser display cap).`);

  return {
    label: `${isPe ? (is64 ? "PE32+" : "PE32") : "COFF"} · ${arch}`,
    architecture: arch,
    kind,
    endianness: "Little-endian",
    entryPoint: isPe ? formatHex(entryPointRva) : "N/A (Object)",
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
