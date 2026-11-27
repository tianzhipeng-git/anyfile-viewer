import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const agentRoot = resolve(scriptsDir, "..");
const repoRoot = resolve(agentRoot, "../..");
const distDir = join(agentRoot, "dist");
const rendererHostRoot = join(agentRoot, "renderer-host");
const vendorManifestSrc = join(repoRoot, "public/vendor/manifest.json");

function loadBundlers() {
  const rootReq = createRequire(join(repoRoot, "package.json"));
  const vitestPath = rootReq.resolve("vitest");
  const vitestReq = createRequire(vitestPath);
  const vitePath = vitestReq.resolve("vite");
  const viteReq = createRequire(vitePath);
  const esbuildPath = viteReq.resolve("esbuild");
  return { vitePath, esbuildPath };
}

function collectWorkspaceAliases() {
  const aliases = [];
  const scanRoots = [join(repoRoot, "viewer"), join(repoRoot, "viewer/plugins")];
  for (const base of scanRoots) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === "plugins" || entry.name === "agent") continue;
      const pkgDir = join(base, entry.name);
      const pkgPath = join(pkgDir, "package.json");
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (!pkg.name) continue;
      const exportsField = pkg.exports ?? {};
      for (const [subpath, target] of Object.entries(exportsField)) {
        let resolvedTarget = null;
        if (typeof target === "string") {
          resolvedTarget = target;
        } else if (target && typeof target === "object") {
          resolvedTarget = target.browser ?? target.default ?? null;
        }
        if (!resolvedTarget) continue;
        const find = subpath === "." ? pkg.name : `${pkg.name}/${subpath.replace(/^\.\//, "")}`;
        aliases.push({ find, replacement: resolve(pkgDir, resolvedTarget) });
      }
    }
  }
  // Longer specifiers first so subpath aliases match before package root.
  aliases.sort((a, b) => b.find.length - a.find.length);
  return aliases;
}

// 1. Regenerate auto-scanned extractor and browser loader maps.
execFileSync(process.execPath, [join(scriptsDir, "generate-extractors.mjs")], { stdio: "inherit" });
execFileSync(process.execPath, [join(scriptsDir, "generate-renderer-loaders.mjs")], { stdio: "inherit" });

// 2. Verify full /vendor/ SHA-256 manifest exists before packaging.
if (!existsSync(vendorManifestSrc)) {
  throw new Error(
    `Missing ${vendorManifestSrc}. Run "pnpm prepare:assets" (or "pnpm prepare:vendor-manifest") first.`,
  );
}

// 3. Clean dist/.
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const { vitePath, esbuildPath } = loadBundlers();
const esbuild = await import(pathToFileURL(esbuildPath).href);
const vite = await import(pathToFileURL(vitePath).href);

// 4. Bundle CLI, library index, worker, and per-plugin ./extract chunks with esbuild.
const extractEntries = {};
const pluginsDir = join(repoRoot, "viewer/plugins");
for (const dir of readdirSync(pluginsDir).sort()) {
  const pluginRoot = join(pluginsDir, dir);
  if (!statSync(pluginRoot).isDirectory()) continue;
  const pkgPath = join(pluginRoot, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!pkg.exports?.["./extract"]) continue;
  const manifestPath = join(pluginRoot, "src/manifest.ts");
  const match = existsSync(manifestPath)
    ? readFileSync(manifestPath, "utf8").match(/\bid\s*:\s*["']([a-z0-9-]+)["']/)
    : null;
  if (match) {
    extractEntries[`extractors/${match[1]}`] = join(pluginRoot, "src/extract.ts");
  }
}

await esbuild.build({
  entryPoints: {
    "cli-main": join(agentRoot, "src/cli-main.ts"),
    index: join(agentRoot, "src/index.ts"),
    worker: join(agentRoot, "src/worker.ts"),
    ...extractEntries,
  },
  outdir: distDir,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outExtension: { ".js": ".mjs" },
  chunkNames: "chunks/[name]-[hash]",
  conditions: ["node", "import", "default"],
  banner: {
    js: 'import { createRequire as __anyfileCreateRequire } from "node:module"; const require = __anyfileCreateRequire(import.meta.url);',
  },
  external: ["node:*", "happy-dom"],
});

const cliEntryPath = join(distDir, "cli.mjs");
writeFileSync(
  cliEntryPath,
  '#!/usr/bin/env node\nimport { runCli } from "./cli-main.mjs";\nprocess.exitCode = await runCli(process.argv.slice(2));\n',
  "utf8",
);
chmodSync(cliEntryPath, 0o755);

// 5. Build single Vite renderer-host app with native code splitting for all browser plugins & workers.
const workspaceAliases = collectWorkspaceAliases();
await vite.build({
  root: rendererHostRoot,
  base: "/renderer-host/",
  configFile: false,
  logLevel: "warn",
  resolve: {
    alias: workspaceAliases.map(({ find, replacement }) => ({
      find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      replacement,
    })),
  },
  worker: {
    format: "es",
  },
  build: {
    outDir: join(distDir, "renderer-host"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 2048,
  },
});

// 6. Copy SKILL.md and full /vendor/ SHA-256 manifest into dist/.
copyFileSync(join(agentRoot, "SKILL.md"), join(distDir, "SKILL.md"));
copyFileSync(vendorManifestSrc, join(distDir, "vendor-manifest.json"));

const extractorCount = Object.keys(extractEntries).length;
console.log(`Built @anyfile/agent -> ${distDir} (${extractorCount} extractor chunk(s), renderer-host, SKILL.md, vendor-manifest.json)`);
