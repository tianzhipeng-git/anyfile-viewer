import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, deflateRawSync, deflateSync } from "node:zlib";

import { strToU8, zipSync } from "fflate";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesDirectory = join(pluginRoot, "examples");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "anyfile-archive-examples-"));
const fixedDate = new Date("2024-01-02T03:04:05Z");

function run(command, args) {
  return execFileSync(command, args, { maxBuffer: 16 * 1024 * 1024 });
}

function concatenate(...parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function emptyZip64() {
  const record = new Uint8Array(56);
  const recordView = new DataView(record.buffer);
  recordView.setUint32(0, 0x06064b50, true);
  recordView.setBigUint64(4, BigInt(44), true);
  recordView.setUint16(12, 45, true);
  recordView.setUint16(14, 45, true);

  const locator = new Uint8Array(20);
  const locatorView = new DataView(locator.buffer);
  locatorView.setUint32(0, 0x07064b50, true);
  locatorView.setBigUint64(8, BigInt(0), true);
  locatorView.setUint32(16, 1, true);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 0xffff, true);
  eocdView.setUint16(10, 0xffff, true);
  eocdView.setUint32(12, 0xffffffff, true);
  eocdView.setUint32(16, 0xffffffff, true);
  return concatenate(record, locator, eocd);
}

try {
  await mkdir(examplesDirectory, { recursive: true });
  const payloadDirectory = join(temporaryDirectory, "payload");
  const unicodeDirectory = join(payloadDirectory, "资料");
  const longDirectory = join(payloadDirectory, "very-long-directory-name".repeat(5));
  await mkdir(unicodeDirectory, { recursive: true });
  await mkdir(longDirectory, { recursive: true });

  const sampleText = strToU8("Anyfile archive metadata viewer example.\n第二行是 Unicode 内容。\n");
  const readmePath = join(payloadDirectory, "README.txt");
  const unicodePath = join(unicodeDirectory, "说明.txt");
  await writeFile(readmePath, sampleText);
  await writeFile(unicodePath, strToU8("只应读取这个文件的元数据，不应读取其 payload。\n"));
  await writeFile(join(longDirectory, "long-path.txt"), strToU8("long path payload\n"));
  await symlink("资料/说明.txt", join(payloadDirectory, "说明-link"));
  await Promise.all([readmePath, unicodePath].map((path) => utimes(path, fixedDate, fixedDate)));

  const zip = zipSync({
    "README.txt": [sampleText, { level: 0, mtime: fixedDate }],
    "资料/说明.txt": [strToU8("unicode ZIP payload\n"), { level: 6, mtime: fixedDate }],
    "../dangerous-path.txt": [strToU8("unsafe path marker\n"), { level: 0, mtime: fixedDate }],
  }, { comment: "Anyfile archive metadata example" });
  await writeFile(join(examplesDirectory, "archive.zip"), zip);
  await writeFile(join(examplesDirectory, "empty-zip64.zip"), emptyZip64());

  const tarPath = join(examplesDirectory, "archive.tar");
  run("tar", ["--format", "pax", "-cf", tarPath, "-C", temporaryDirectory, "payload"]);
  await writeFile(join(examplesDirectory, "archive.tar.gz"), run("gzip", ["-n", "-c", tarPath]));
  await writeFile(join(examplesDirectory, "archive.tar.xz"), run("xz", ["-c", tarPath]));
  await writeFile(join(examplesDirectory, "archive.tar.zst"), run("zstd", ["-q", "-c", tarPath]));

  await writeFile(join(examplesDirectory, "sample.gz"), run("gzip", ["-n", "-c", readmePath]));
  await writeFile(join(examplesDirectory, "sample.xz"), run("xz", ["-c", readmePath]));
  await writeFile(join(examplesDirectory, "sample.zst"), run("zstd", ["-q", "-c", readmePath]));
  await writeFile(join(examplesDirectory, "sample.bz2"), run("bzip2", ["-c", readmePath]));
  await writeFile(join(examplesDirectory, "sample.lz4"), run("lz4", ["-q", "-c", readmePath]));
  await writeFile(join(examplesDirectory, "sample.zlib"), deflateSync(sampleText));
  await writeFile(join(examplesDirectory, "sample.deflate"), deflateRawSync(sampleText));
  await writeFile(join(examplesDirectory, "sample.br"), brotliCompressSync(sampleText));
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
