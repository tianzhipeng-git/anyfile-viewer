import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareGplApplicationSource } from "./prepare-gpl-source.mjs";

export async function prepareDwgSource(root, version) {
  const target = await prepareGplApplicationSource(root);
  await writeFile(
    join(target, "dwg.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DWG source and licenses</title><body><h1>DWG source and licenses / DWG 源码与许可</h1><p>This application includes GNU LibreDWG 0.14 (GPL-3.0-or-later) and libredwg-web 0.7.10 (GPL-3.0). Distribution of the combined DWG application is under GPLv3; original component notices remain in effect. No warranty.</p><p>本应用包含 GPL 组件，集成 DWG 功能的组合应用按 GPLv3 分发；各组件保留原有声明，不提供担保。</p><ul><li><a href="THIRD_PARTY_NOTICES.md">Third-party notices / 第三方许可声明</a></li><li><a href="application.tar.gz">Corresponding application source / 对应应用源码</a></li><li><a href="/vendor/libredwg/${version}/COPYING">GNU GPLv3 license</a></li><li><a href="/vendor/libredwg/${version}/libredwg-source.tar.gz">LibreDWG corresponding source</a></li><li><a href="/vendor/libredwg/${version}/bindings-source.tar.gz">TypeScript and Embind corresponding source</a></li><li><a href="/vendor/libredwg/${version}/SOURCE.md">Origins and build instructions</a></li><li><a href="/vendor/libredwg/${version}/build-info.json">Artifact hashes and build configuration</a></li></ul><p>Build application: Node 24, pnpm 10.32.1, pnpm install --frozen-lockfile, pnpm build. The archive includes application code, dependency manifests and all build recipes. Runtime binaries and compressed dependency archives are distributed separately, not duplicated in this source archive. Restore or rebuild source-built dependencies using their included recipes in tools/ before pnpm build. The DWG source archives are linked above. Other source-built dependencies use the recipes in tools/ and the source links documented in docs/viewer-source-built-dependencies.md.</p></body></html>`,
  );
}
