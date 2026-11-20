import type { ByteSource } from "@anyfile/dev-binary-core";

import {
  MAX_ARCHIVE_MEMBERS,
  assertWithinBounds,
  checkedAdd,
  createDataView,
  invalidFile,
  readBoundedStringTable,
  readFixedAscii,
  resourceLimit,
} from "./limits";
import type { ArchiveMemberEntry, BinarySliceReport, KeyValueRow } from "./model";

const AR_MAGIC = "!<arch>\n";

function parseGnuStringName(strTable: Uint8Array, offset: number): string {
  if (offset < 0 || offset >= strTable.length) return `/${offset}`;
  let end = offset;
  const limit = Math.min(strTable.length, offset + 512);
  while (end < limit && strTable[end] !== 0x0a && strTable[end] !== 0x00) {
    if (strTable[end] === 0x2f && (end + 1 >= limit || strTable[end + 1] === 0x0a)) break;
    end += 1;
  }
  return new TextDecoder().decode(strTable.subarray(offset, end)).replace(/\/$/, "");
}

function detectMemberKind(name: string, magicBytes: Uint8Array): string {
  if (name === "/" || name === "/SYM64/" || name.startsWith("__.SYMDEF")) return "Symbol index";
  if (name === "//") return "GNU long-name table";
  if (name === "__.PKGDEF") return "Go package metadata";
  if (name === "lib.rmeta" || name.endsWith(".rmeta")) return "Rust crate metadata";
  if (magicBytes.length < 4) return "Data";

  if (magicBytes[0] === 0x7f && magicBytes[1] === 0x45 && magicBytes[2] === 0x4c && magicBytes[3] === 0x46) {
    return "ELF object";
  }
  const m = createDataView(magicBytes).getUint32(0, false);
  if (m === 0xfeedface || m === 0xcefaedfe || m === 0xfeedfacf || m === 0xcffaedfe) {
    return "Mach-O object";
  }
  if ((magicBytes[0] === 0x42 && magicBytes[1] === 0x43 && magicBytes[2] === 0xc0 && magicBytes[3] === 0xde)
    || m === 0xdec0170b) {
    return "LLVM bitcode";
  }
  const coffMachine = createDataView(magicBytes).getUint16(0, true);
  if (coffMachine === 0x014c || coffMachine === 0x8664 || coffMachine === 0xaa64 || coffMachine === 0x01c4) {
    return "COFF object";
  }
  if (coffMachine === 0 && magicBytes[2] === 0xff && magicBytes[3] === 0xff) {
    return "COFF short import";
  }
  return "Object / Data";
}

export async function parseUnixArchive(source: ByteSource): Promise<BinarySliceReport> {
  if (source.size < 8) invalidFile("Unix archive header is truncated.");
  const magic = readFixedAscii(await source.read(0, 8), 0, 8);
  if (magic !== AR_MAGIC) invalidFile("Invalid Unix archive magic signature.");

  let pos = 8;
  let gnuStrTable: Uint8Array = new Uint8Array(0);
  let hasSymbolIndex = false;
  let indexedSymbolCount: number | undefined;
  let flavor = "Unix static archive (ar)";
  const members: ArchiveMemberEntry[] = [];
  const objectKinds = new Set<string>();
  const notices: string[] = [];

  while (pos < source.size) {
    if (pos + 60 > source.size) invalidFile("Unix archive member header is truncated.");
    if (members.length >= MAX_ARCHIVE_MEMBERS) {
      resourceLimit("Unix archive member count exceeds browser limit.");
    }
    const header = await source.read(pos, 60);
    if (header[58] !== 0x60 || header[59] !== 0x0a) {
      invalidFile(`Invalid Unix archive member trailer at offset ${pos}.`);
    }

    const rawName = readFixedAscii(header, 0, 16).trimEnd();
    const mtimeStr = readFixedAscii(header, 16, 12).trim();
    const modeStr = readFixedAscii(header, 40, 8).trim();
    const sizeStr = readFixedAscii(header, 48, 10).trim();
    const declaredSize = Number.parseInt(sizeStr, 10);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0) {
      invalidFile(`Invalid archive member size "${sizeStr}".`);
    }

    const dataOffset = checkedAdd(pos, 60, "Archive member data offset");
    assertWithinBounds(source.size, dataOffset, declaredSize, `Archive member ${rawName}`);

    let name = rawName;
    let payloadOffset = dataOffset;
    let payloadSize = declaredSize;

    if (rawName.startsWith("#1/")) {
      const nameLen = Number.parseInt(rawName.slice(3), 10);
      if (!Number.isSafeInteger(nameLen) || nameLen < 0 || nameLen > declaredSize || nameLen > 4096) {
        invalidFile(`Invalid BSD long archive name "${rawName}".`);
      }
      const nameBytes = nameLen > 0 ? await source.read(dataOffset, nameLen) : new Uint8Array(0);
      name = readFixedAscii(nameBytes, 0, nameLen);
      payloadOffset = checkedAdd(dataOffset, nameLen, "BSD member payload");
      payloadSize = declaredSize - nameLen;
    } else if (rawName === "//") {
      name = "//";
      gnuStrTable = (await readBoundedStringTable(source, dataOffset, declaredSize)).bytes;
    } else if (/^\/\d+$/.test(rawName)) {
      const strOff = Number.parseInt(rawName.slice(1), 10);
      name = parseGnuStringName(gnuStrTable, strOff);
    } else if (rawName !== "/" && rawName.endsWith("/")) {
      name = rawName.slice(0, -1);
    }

    if (name === "/" || name === "/SYM64/" || name.startsWith("__.SYMDEF")) {
      hasSymbolIndex = true;
      if (name === "/" && payloadSize >= 4) {
        const countBytes = await source.read(payloadOffset, 4);
        indexedSymbolCount = createDataView(countBytes).getUint32(0, false);
      }
    } else if (name === "__.PKGDEF") {
      flavor = "Go package archive (.a)";
    } else if (name === "lib.rmeta" || name.endsWith(".rmeta")) {
      flavor = "Rust static library (.rlib)";
    }

    const headLen = Math.min(payloadSize, 8);
    const headBytes = headLen > 0 ? await source.read(payloadOffset, headLen) : new Uint8Array(0);
    const memberKind = detectMemberKind(name, headBytes);
    if (memberKind.endsWith("object") || memberKind === "LLVM bitcode") {
      objectKinds.add(memberKind);
    }

    const mtimeNum = Number.parseInt(mtimeStr, 10);
    const mtime = Number.isFinite(mtimeNum) && mtimeNum > 0
      ? new Date(mtimeNum * 1000).toISOString()
      : mtimeStr || "0";

    members.push({
      index: members.length + 1,
      name: name || "(unnamed)",
      size: payloadSize,
      mode: modeStr || "-",
      mtime,
      kind: memberKind,
      offset: payloadOffset,
    });

    const paddedSize = declaredSize + (declaredSize % 2);
    pos = checkedAdd(dataOffset, paddedSize, "Next archive member offset");
  }

  const archSummary = objectKinds.size > 0 ? [...objectKinds].join(", ") : "Archive container";
  const metadata: KeyValueRow[] = [
    { key: "Format", value: flavor },
    { key: "Members", value: String(members.length) },
    { key: "Symbol index", value: hasSymbolIndex ? (indexedSymbolCount !== undefined ? `Present (${indexedSymbolCount} symbols)` : "Present") : "Absent" },
    { key: "Member objects", value: archSummary },
  ];

  return {
    label: `${flavor} · ${members.length} members`,
    architecture: archSummary,
    kind: flavor,
    endianness: "ASCII headers",
    entryPoint: "N/A (Static archive)",
    metadata,
    segments: [],
    sections: [],
    dependencies: [],
    symbols: [],
    totalSymbols: indexedSymbolCount ?? 0,
    symbolsTruncated: false,
    members,
    totalMembers: members.length,
    membersTruncated: false,
    notices,
  };
}
