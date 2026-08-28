import { ascii, view } from "./binary";
import type { ArchiveFormatId, IdentifiedFormat } from "./types";

const EXTENSIONS: readonly (readonly [string, ArchiveFormatId])[] = [
  [".tar.zstd", "zstd"], [".tar.zst", "zstd"], [".tar.bz2", "bzip2"],
  [".tar.lz4", "lz4"], [".tar.xz", "xz"], [".tar.gz", "gzip"],
  [".deflate", "deflate"], [".bzip2", "bzip2"], [".gzip", "gzip"],
  [".zip64", "zip"], [".zstd", "zstd"], [".tgz", "gzip"], [".txz", "xz"],
  [".tzst", "zstd"], [".tbz2", "bzip2"], [".tbz", "bzip2"],
  ...[".zip", ".jar", ".war", ".ear", ".apk", ".aab", ".ipa", ".epub", ".odt",
    ".ods", ".odp", ".odg", ".odf", ".docx", ".xlsx", ".pptx", ".nupkg", ".snupkg",
    ".vsix", ".whl", ".xpi", ".cbz", ".kmz", ".usdz"].map((item) => [item, "zip"] as const),
  [".tar", "tar"], [".gz", "gzip"], [".xz", "xz"], [".zst", "zstd"],
  [".bz2", "bzip2"], [".lz4", "lz4"], [".zlib", "zlib"], [".zz", "zlib"],
  [".dfl", "deflate"], [".br", "brotli"],
];

function extensionFor(name: string): readonly [string, ArchiveFormatId] | undefined {
  const normalized = name.toLowerCase();
  return EXTENSIONS.find(([extension]) => normalized.endsWith(extension));
}

function magicFor(bytes: Uint8Array): ArchiveFormatId | undefined {
  if (bytes.length >= 4) {
    const data = view(bytes);
    const little = data.getUint32(0, true);
    const big = data.getUint32(0, false);
    if ([0x04034b50, 0x06054b50, 0x08074b50].includes(little)) return "zip";
    if (big === 0x28b52ffd) return "zstd";
    if (little === 0x184d2204) return "lz4";
  }
  if (bytes.length >= 6 && ascii(bytes.subarray(0, 6)) === "\xfd7zXZ\0") return "xz";
  if (bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 8) return "gzip";
  if (bytes.length >= 4 && ascii(bytes.subarray(0, 3)) === "BZh" && bytes[3] >= 0x31 && bytes[3] <= 0x39) return "bzip2";
  if (bytes.length >= 2) {
    const cmf = bytes[0];
    const flg = bytes[1];
    if ((cmf & 0x0f) === 8 && ((cmf << 8) + flg) % 31 === 0) return "zlib";
  }
  return undefined;
}

export function identifyFormat(fileName: string, header: Uint8Array): IdentifiedFormat {
  const extensionMatch = extensionFor(fileName);
  if (!extensionMatch) throw new Error("No archive extension matched.");
  const [extension, extensionId] = extensionMatch;
  const magicId = magicFor(header);
  const id = magicId ?? extensionId;
  return {
    id,
    extension,
    magicMatched: magicId === extensionId,
    compoundTar: extension.startsWith(".tar.") || [".tgz", ".txz", ".tzst", ".tbz", ".tbz2"].includes(extension),
  };
}
