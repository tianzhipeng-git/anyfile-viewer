import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function prepareGplApplicationSource(root) {
  const target = join(root, "public/source");
  await mkdir(target, { recursive: true });

  // Work in exported deployment checkouts too, without requiring Git metadata.
  // Only source directories and explicit root build files enter the archive.
  const allowed = [];
  const excluded = new Set(["node_modules", "coverage", "build", "__pycache__"]);

  async function visit(directory = "") {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const file = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || excluded.has(entry.name) || (entry.name.startsWith(".") && file !== ".gitignore")) {
        continue;
      }
      if (["public/vendor", "public/source", "docs/tasks"].includes(file) || /\.(log|tsbuildinfo|pem)$/.test(file)) {
        continue;
      }
      if (entry.isDirectory()) {
        if (directory || /^(src|viewer|scripts|licenses|docs|third_party|public|tools)$/.test(file)) {
          await visit(file);
        }
      } else if (
        directory ||
        /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|next\.config\.[a-z]+|postcss\.config\.[a-z]+|eslint\.config\.[a-z]+|vitest\.config\.[a-z]+|LICENSE[^/]*|THIRD_PARTY_NOTICES\.md|README\.md|AGENTS\.md|\.gitignore)$/.test(file)
      ) {
        allowed.push(file);
      }
    }
  }

  await visit();
  const temporary = await mkdtemp(join(tmpdir(), "gpl-source-"));
  try {
    const list = join(temporary, "files");
    await writeFile(
      list,
      `${allowed
        .filter((file) => !file.startsWith("third_party/") || !/\.(wasm|js|gz|tgz|xz|bz2|zst|zip|a|o|bc)$/.test(file))
        .sort()
        .join("\0")}\0`,
    );
    execFileSync("tar", ["--null", "-czf", join(target, "application.tar.gz"), "-T", list], { cwd: root });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }

  await writeFile(join(target, "THIRD_PARTY_NOTICES.md"), await readFile(join(root, "THIRD_PARTY_NOTICES.md")));
  return target;
}
