import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const version = "1.23.2-anyfile.1";
const output = join(root, "third_party/heif-wasm", version);
const files = ["heif-decoder.js", "heif-decoder.wasm", "LICENSE.libheif", "LICENSE.libde265", "THIRD_PARTY_NOTICES.md", "SOURCE.md"];
const artifacts = {};
for (const file of files) {
  const bytes = await readFile(join(output, file));
  artifacts[file] = { bytes: (await stat(join(output, file))).size, sha256: createHash("sha256").update(bytes).digest("hex") };
}
const adapter = await readFile(join(root, "tools/heif-wasm-build/adapter.cc"));
const recipe = await readFile(join(root, "tools/heif-wasm-build/build-in-container.sh"));
const info = {
  artifactVersion: version,
  upstream: {
    libheif: { version: "1.23.2", tag: "v1.23.2", commit: "ac1cb05c39008f01525c991ff8b88f84ddf70fd2", url: "https://github.com/strukturag/libheif/archive/refs/tags/v1.23.2.tar.gz", sha256: "1405ed070421459b569ff49deab109b7f1a30a447e72a9b20a4154f774634a44" },
    libde265: { version: "1.1.1", tag: "v1.1.1", commit: "4dd701fffac01632ffd5cabc5ef10deb56accba1", url: "https://github.com/strukturag/libde265/archive/refs/tags/v1.1.1.tar.gz", sha256: "5b4fac677018e6074196e8f9889f3e4a5310e46afbf22a893f620d4e24d3510e" },
  },
  toolchain: { image: "emscripten/emsdk:4.0.10", digest: "sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7" },
  flags: ["-O3", "-flto", "-fexceptions", "-std=c++20", "--no-entry", "-sMODULARIZE=1", "-sEXPORT_ES6=1", "-sENVIRONMENT=worker", "-sFILESYSTEM=0", "-sDYNAMIC_EXECUTION=0", "-sALLOW_MEMORY_GROWTH=1", "-sMAXIMUM_MEMORY=536870912", "-sASSERTIONS=0"],
  features: { decodeOnly: true, hevc: true, encoders: false, otherCodecs: false, dynamicPlugins: false, threads: false, unsafeEval: false },
  adapterSha256: createHash("sha256").update(adapter).digest("hex"),
  recipeSha256: createHash("sha256").update(recipe).digest("hex"),
  artifacts,
};
await writeFile(join(output, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);
