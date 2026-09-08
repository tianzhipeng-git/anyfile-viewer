import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
export async function prepareDwgSource(root, version) {
  const target = join(root,"public/source");
  await mkdir(target,{recursive:true});
  // Work in exported deployment checkouts too, without requiring Git metadata.
  // Only source directories and explicit root build files enter the archive.
  const allowed = [];
  const excluded = new Set(["node_modules", "coverage", "build", "__pycache__"]);
  async function visit(directory = "") {
    for (const entry of await readdir(join(root,directory),{withFileTypes:true})) {
      const file = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || excluded.has(entry.name) || entry.name.startsWith(".") && file !== ".gitignore") continue;
      if (["public/vendor","public/source","docs/tasks"].includes(file) || /\.(log|tsbuildinfo|pem)$/.test(file)) continue;
      if (entry.isDirectory()) {
        if (directory || /^(src|viewer|scripts|licenses|docs|third_party|public|tools)$/.test(file)) await visit(file);
      } else if (directory || /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|next\.config\.[a-z]+|postcss\.config\.[a-z]+|eslint\.config\.[a-z]+|vitest\.config\.[a-z]+|LICENSE[^/]*|THIRD_PARTY_NOTICES\.md|README\.md|AGENTS\.md|\.gitignore)$/.test(file)) allowed.push(file);
    }
  }
  await visit();
  const temporary = await mkdtemp(join(tmpdir(),"dwg-source-"));
  try {
    const list = join(temporary,"files");
    await writeFile(list,allowed.filter(file => !file.startsWith("third_party/") || !/\.(wasm|js|gz|tgz|xz|bz2|zst|zip|a|o|bc)$/.test(file)).sort().join("\0")+"\0");
    execFileSync("tar",["--null","-czf",join(target,"application.tar.gz"),"-T",list],{cwd:root});
  } finally { await rm(temporary,{recursive:true,force:true}); }
  await writeFile(join(target,"dwg.html"),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DWG source and licenses</title><body><h1>DWG source and licenses / DWG 源码与许可</h1><p>This application includes GNU LibreDWG 0.14 (GPL-3.0-or-later) and libredwg-web 0.7.10 (GPL-3.0). Distribution of the combined DWG application is under GPLv3; original component notices remain in effect. No warranty.</p><p>本应用包含 GPL 组件，集成 DWG 功能的组合应用按 GPLv3 分发；各组件保留原有声明，不提供担保。</p><ul><li><a href="THIRD_PARTY_NOTICES.md">Third-party notices / 第三方许可声明</a></li><li><a href="application.tar.gz">Corresponding application source / 对应应用源码</a></li><li><a href="/vendor/libredwg/${version}/COPYING">GNU GPLv3 license</a></li><li><a href="/vendor/libredwg/${version}/libredwg-source.tar.gz">LibreDWG corresponding source</a></li><li><a href="/vendor/libredwg/${version}/bindings-source.tar.gz">TypeScript and Embind corresponding source</a></li><li><a href="/vendor/libredwg/${version}/SOURCE.md">Origins and build instructions</a></li><li><a href="/vendor/libredwg/${version}/build-info.json">Artifact hashes and build configuration</a></li></ul><p>Build application: Node 24, pnpm 10.32.1, pnpm install --frozen-lockfile, pnpm build. The archive includes application code, dependency manifests and all build recipes. Runtime binaries and compressed dependency archives are distributed separately, not duplicated in this source archive. Restore or rebuild source-built dependencies using their included recipes in tools/ before pnpm build. The DWG source archives are linked above. Other source-built dependencies use the recipes in tools/ and the source links documented in docs/viewer-source-built-dependencies.md.</p></body></html>`);
  // Include the human-readable integration notice beside the downloadable source.
  await writeFile(join(target,"THIRD_PARTY_NOTICES.md"),await readFile(join(root,"THIRD_PARTY_NOTICES.md")));
}
