import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareGplApplicationSource } from "./prepare-gpl-source.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "3.5.29-anyfile.1";
const source = join(root, "third_party/djvulibre", version);
const target = join(root, "public/vendor/djvulibre", version);
const licenseTarget = join(root, "public/vendor/licenses/djvulibre", version);

const info = JSON.parse(await readFile(join(source, "build-info.json"), "utf8"));
if (info.artifactVersion !== version) throw new Error("Unexpected DjVuLibre artifact version");

for (const [file, expected] of Object.entries(info.artifacts)) {
  if (file.split("/").some((part) => part === ".." || !part) || file.startsWith("/")) {
    throw new Error(`Invalid DjVu artifact path: ${file}`);
  }
  const bytes = await readFile(join(source, file));
  if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) {
    throw new Error(`DjVuLibre artifact integrity failed: ${file}`);
  }
}

await rm(target, { recursive: true, force: true });
await rm(licenseTarget, { recursive: true, force: true });
for (const file of [...Object.keys(info.artifacts), "build-info.json"]) {
  const destination = file.endsWith("-source.tar.gz") ? join(licenseTarget, file) : join(target, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(source, file), destination);
}

const sourceTarget = await prepareGplApplicationSource(root);
await writeFile(
  join(sourceTarget, "djvu.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DjVu source and licenses</title><body><h1>DjVu source and licenses / DjVu 源码与许可</h1><p>This application includes DjVuLibre 3.5.29 (GPL-2.0-or-later). Distribution of the combined DjVu-enabled application is subject to GPLv2+; original component notices remain in effect. No warranty.</p><p>本应用包含 DjVuLibre 3.5.29（GPL-2.0-or-later），集成 DjVu 功能的组合应用按 GPLv2+ 要求提供对应源码与许可；各组件保留原有声明，不提供担保。</p><ul><li><a href="THIRD_PARTY_NOTICES.md">Third-party notices / 第三方许可声明</a></li><li><a href="application.tar.gz">Corresponding application source / 对应应用源码</a></li><li><a href="/vendor/djvulibre/${version}/COPYING">GNU GPLv2 license</a></li><li><a href="/vendor/djvulibre/${version}/COPYRIGHT">DjVuLibre copyright notice</a></li><li><a href="/vendor/licenses/djvulibre/${version}/djvulibre-source.tar.gz">DjVuLibre corresponding source</a></li><li><a href="/vendor/djvulibre/${version}/SOURCE.md">Origins and build instructions</a></li><li><a href="/vendor/djvulibre/${version}/build-info.json">Artifact hashes and build configuration</a></li></ul><p>Build application: Node 24, pnpm 10.32.1, pnpm install --frozen-lockfile, pnpm build.</p></body></html>`,
);
