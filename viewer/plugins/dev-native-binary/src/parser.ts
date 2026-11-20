import { FileByteSource } from "@anyfile/dev-binary-core";

import { parseElf } from "./elf";
import { MAX_FILE_BYTES, createDataView, invalidFile, resourceLimit } from "./limits";
import { parseMachOOrFat } from "./mach-o";
import type { NativeBinaryReport } from "./model";
import { parsePeOrCoff } from "./pe-coff";
import { parseUnixArchive } from "./unix-ar";

const MACHO_MAGICS = new Set([
  0xfeedface, 0xcefaedfe,
  0xfeedfacf, 0xcffaedfe,
  0xcafebabe, 0xbebafeca,
  0xcafebabf, 0xbfbafeca,
]);

const COFF_MACHINES = new Set([
  0x014c, 0x0162, 0x0166, 0x0168, 0x0169, 0x0266, 0x0366, 0x0466,
  0x01c0, 0x01c2, 0x01c4, 0x0200, 0x5032, 0x5064, 0x5128, 0x6232, 0x6264,
  0x8664, 0xaa64,
]);

export async function parseNativeBinary(file: File, signal: AbortSignal): Promise<NativeBinaryReport> {
  if (file.size > MAX_FILE_BYTES) {
    resourceLimit(`Native binary exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MiB browser inspection limit.`);
  }
  if (file.size < 8) invalidFile("Native binary file is too small.");

  const source = new FileByteSource(file, signal);
  const head = await source.read(0, Math.min(source.size, 64));

  // ELF: 0x7f 'E' 'L' 'F'
  if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
    const slice = await parseElf(source);
    return { format: "ELF", fileSize: file.size, summary: slice.label, slices: [slice] };
  }

  // Unix archive: "!<arch>\n"
  if (head[0] === 0x21 && head[1] === 0x3c && head[2] === 0x61 && head[3] === 0x72
      && head[4] === 0x63 && head[5] === 0x68 && head[6] === 0x3e && head[7] === 0x0a) {
    const slice = await parseUnixArchive(source);
    return { format: "Unix Archive", fileSize: file.size, summary: slice.label, slices: [slice] };
  }

  // Mach-O / Universal Fat
  const beMagic = createDataView(head).getUint32(0, false);
  if (MACHO_MAGICS.has(beMagic)) {
    const { isFat, slices } = await parseMachOOrFat(source);
    return {
      format: isFat ? "Mach-O Fat" : "Mach-O",
      fileSize: file.size,
      summary: isFat ? `Universal Mach-O (${slices.length} architectures)` : slices[0].label,
      slices,
    };
  }

  // PE (MZ)
  if (head[0] === 0x4d && head[1] === 0x5a) {
    const slice = await parsePeOrCoff(source);
    return { format: "PE", fileSize: file.size, summary: slice.label, slices: [slice] };
  }

  // COFF .obj
  if (head.length >= 20 && COFF_MACHINES.has(createDataView(head).getUint16(0, true))) {
    const slice = await parsePeOrCoff(source);
    return { format: "COFF", fileSize: file.size, summary: slice.label, slices: [slice] };
  }

  invalidFile("Unsupported or unrecognized native binary format.");
}
