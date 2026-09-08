import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Usage: node write-build-info.mjs <output-directory>");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const artifactFiles = [
  "stet_wasm.js",
  "stet_wasm_bg.wasm",
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "SOURCE.md",
  "THIRD_PARTY_NOTICES.md",
];

async function details(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const artifacts = Object.fromEntries(await Promise.all(artifactFiles.map(async (fileName) => [
  fileName,
  await details(join(outputDirectory, fileName)),
])));
const info = {
  artifactVersion: basename(outputDirectory),
  upstream: {
    stet: {
      version: "0.8.1",
      tag: "v0.8.1",
      commit: "a61c70796f25e0d0a8f5eaa04992cb7cd222aa07",
      url: "https://github.com/AndyCappDev/stet/archive/refs/tags/v0.8.1.tar.gz",
      sha256: "78a1140a4fad3862325f04402e746f590b4fb82664127e9416d97a2052be0510",
    },
  },
  toolchain: {
    rustc: "1.94.0 (4a4ef493e 2026-03-02)",
    wasmPack: "0.14.0",
    wasmBindgen: "0.2.114",
    wasmOpt: "version 125",
    target: "wasm32-unknown-unknown",
    buildHost: "aarch64-apple-darwin",
    container: null,
  },
  flags: ["wasm-pack build", "--target web", "--release", "lto=true", "codegen-units=1", "opt-level=3"],
  features: { postscript: true, eps: true, pdfReader: false, threads: false, unsafeEval: false },
  recipeSha256: (await details(join(scriptDirectory, "build.sh"))).sha256,
  smokeTestSha256: (await details(join(scriptDirectory, "smoke.mjs"))).sha256,
  metadataWriterSha256: (await details(fileURLToPath(import.meta.url))).sha256,
  builtAt: new Date().toISOString(),
  artifacts,
};
await writeFile(join(outputDirectory, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
