// Fast structural guard (no build). Run: pnpm check:repo
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { extractManifestId, loadGlobalPluginPolicy, readPluginPolicyFile } from "./plugin-policies.mjs";

const MAX_LINES = 1000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const LINE_CHECKED = /\.(ts|tsx|mts|mjs|cjs|js|css|md|py|sh|c|cc|cpp|h|go)$/;
const UNCHECKED_PATHS = /^(third_party|licenses|\.agents|public)\/|\/(examples|fixtures|validation)\//;
// Large tracked files that predate this check. Do not add to this list; keep samples small.
const LARGE_FILE_ALLOWLIST = new Set(["docs/ebooks/fixtures/huge-binary.fb2"]);
// Plugins that predate the real-sample rule. Remove an entry once the plugin gains examples/.
const PLUGINS_WITHOUT_SAMPLES = new Set([
  "cad-dwg", "cad-exchange", "camera-raw", "code", "comic-book", "dev-wasm", "dji-osmo", "ffmpeg-video",
  "gopro-max", "hex", "insta360", "mobi", "pixelmator-pxd", "powerpoint",
]);
// Registered plugins without a site page in src/content/manifests.ts.
// The FFmpeg viewers are fallbacks behind an unpublished extension set.
const UNPUBLISHED_PLUGINS = new Set(["ffmpeg-audio", "ffmpeg-video"]);
const SAMPLE_DIRECTORIES = ["examples", "fixtures"];
const NON_SAMPLE = /^(readme|license|notice|sources?)(\.|$)|\.(md|json|txt|py|mjs|ts)$/i;
const PROBE_BROWSER_GLOBALS = /\b(VideoDecoder|AudioDecoder|AudioContext|Worker|window|document|navigator|DOMParser|createImageBitmap|OffscreenCanvas|HTMLElement)\b/;
const INLINE_WASM_URL = /new\s+URL\s*\([^)]*\.wasm["'`][^)]*import\.meta\.url/;
const BUNDLER_IGNORE_COMMENT = /webpackIgnore|turbopackIgnore|@vite-ignore/;
const RAW_DOM_PARSER = /\bnew\s+DOMParser\s*\(/;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

const errors = [];
const fail = (message) => errors.push(message);
const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

// Tracked files: line and size limits.
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\0").filter((path) => path && existsSync(path));
for (const path of tracked) {
  if (path.startsWith("third_party/") || path.startsWith(".agents/")) continue;
  const { size } = statSync(path);
  if (size > MAX_FILE_BYTES && !LARGE_FILE_ALLOWLIST.has(path)) {
    fail(`${path} is ${(size / 1048576).toFixed(1)} MiB; tracked files must stay under 2 MiB (use a smaller sample or third_party/)`);
  }
  if (LINE_CHECKED.test(path) && !UNCHECKED_PATHS.test(path)) {
    const lines = read(path).replace(/\n$/, "").split("\n").length;
    if (lines > MAX_LINES) fail(`${path} has ${lines} lines; the limit is ${MAX_LINES}, split it`);
  }
}

// Relative Markdown links must resolve. SOURCE.md files ship beside vendored artifacts and link there.
const trackedSet = new Set(tracked);
for (const path of tracked) {
  if (!path.endsWith(".md") || path.endsWith("SOURCE.md") || path.startsWith("third_party/") || path.startsWith(".agents/")) continue;
  for (const [, target] of read(path).replace(/```[\s\S]*?```/g, "").matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^([a-z]+:|#|\/)/i.test(target)) continue;
    const resolved = normalize(join(dirname(path), decodeURIComponent(target.split("#")[0])));
    if (!existsSync(resolved) && !trackedSet.has(resolved)) fail(`${path}: broken link ${target}`);
  }
}

// ROADMAP.md items: "- [ ] 低|中|高 | requirement | optional note".
for (const [index, line] of read("ROADMAP.md").split("\n").entries()) {
  if (/^- \[/.test(line) && !/^- \[[ x!]\] (低|中|高) \| \S/.test(line)) fail(`ROADMAP.md:${index + 1}: item must look like "- [ ] 中 | requirement | note"`);
}

// Plugin wiring.
try { loadGlobalPluginPolicy("."); } catch (error) { fail(error.message); }
const rootDependencies = readJson("package.json").dependencies;
const browserRegistrations = read("src/lib/viewer-registrations.ts");
const registryDir = "viewer/registry/src";
const registrySource = existsSync(registryDir)
  ? walk(registryDir).filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts")).map(read).join("\n")
  : "";
if (!existsSync(registryDir) || !browserRegistrations.includes("@anyfile/viewer-registry")) {
  fail("shared routing registry missing: move manifest+probe registrations to @anyfile/viewer-registry and import it from src/lib/viewer-registrations.ts");
}
const contentManifests = read("src/content/manifests.ts");
const pluginDirectories = readdirSync("viewer/plugins").filter((name) => statSync(join("viewer/plugins", name)).isDirectory());
const pluginPackages = new Map(pluginDirectories.map((name) => [readJson(join("viewer/plugins", name, "package.json")).name, name]));
const seenManifestIds = new Map();

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const name of pluginDirectories) {
  const root = join("viewer/plugins", name);
  const pkg = readJson(join(root, "package.json"));
  const where = `viewer/plugins/${name}`;
  try { readPluginPolicyFile(root); } catch (error) { fail(`${where}: ${error.message}`); }
  const manifestSource = read(join(root, "src/manifest.ts"));
  const manifestId = extractManifestId(manifestSource);
  if (!manifestId) fail(`${where}/src/manifest.ts: missing literal id`);
  else if (seenManifestIds.has(manifestId)) fail(`${where}: duplicate manifest id ${manifestId} (also in viewer/plugins/${seenManifestIds.get(manifestId)})`);
  else seenManifestIds.set(manifestId, name);
  if (pkg.exports?.["./manifest"] !== "./src/manifest.ts") fail(`${where}: package.json must export ./manifest from ./src/manifest.ts`);
  if (rootDependencies[pkg.name] !== "workspace:*") fail(`${where}: root package.json must depend on ${pkg.name}`);
  if (!browserRegistrations.includes(`"${pkg.name}"`)) fail(`${where}: no browser loader in src/lib/viewer-registrations.ts`);
  if (!registrySource.includes(`"${pkg.name}/manifest"`)) fail(`${where}: not registered in @anyfile/viewer-registry (viewer/registry/src/)`);
  if (pkg.exports?.["./probe"] && !registrySource.includes(`"${pkg.name}/probe"`)) fail(`${where}: probe not registered in @anyfile/viewer-registry`);
  if (pkg.exports?.["./browser-probe"] && !registrySource.includes(`"${pkg.name}/browser-probe"`)) fail(`${where}: browser-probe not registered in @anyfile/viewer-registry`);
  if (contentManifests.includes(`"${pkg.name}/manifest"`) === UNPUBLISHED_PLUGINS.has(name)) fail(`${where}: add it to src/content/manifests.ts (site pages) or UNPUBLISHED_PLUGINS`);
  if (!existsSync(join(root, "README.md"))) fail(`${where}: missing README.md`);

  const sources = walk(join(root, "src"));
  if (!sources.some((path) => /\.test\.ts$/.test(path))) fail(`${where}: has no *.test.ts`);

  if (pkg.exports?.["./extract"]) {
    if (pkg.exports["./extract"] !== "./src/extract.ts") {
      fail(`${where}: package.json must export ./extract from ./src/extract.ts`);
    }
    if (!existsSync(join(root, "src/extract.ts"))) {
      fail(`${where}: package.json exports ./extract but src/extract.ts is missing`);
    }
    const nodeExtractTests = sources.filter((path) => {
      if (!/\.test\.ts$/.test(path)) return false;
      const content = read(path);
      return /@vitest-environment\s+node\b/.test(content) && /examples\b/.test(content);
    });
    if (nodeExtractTests.length === 0) {
      fail(`${where}: exports ./extract and must include a // @vitest-environment node test using real examples/ fixtures`);
    }
  }

  const hasSamples = SAMPLE_DIRECTORIES.some((sub) => existsSync(join(root, sub))
    && walk(join(root, sub)).some((path) => !NON_SAMPLE.test(path.split("/").pop())));
  if (!hasSamples && !PLUGINS_WITHOUT_SAMPLES.has(name)) fail(`${where}: add real sample files under examples/ (see docs/plugin-development.md)`);
  if (hasSamples && PLUGINS_WITHOUT_SAMPLES.has(name)) fail(`${where}: now has samples; remove it from PLUGINS_WITHOUT_SAMPLES in scripts/check-repo.mjs`);

  const manifestImports = [...read(join(root, "src/manifest.ts")).matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((match) => match[1]);
  for (const specifier of manifestImports) {
    if (specifier !== "@anyfile/viewer-protocol" && !specifier.startsWith("./")) {
      fail(`${where}/src/manifest.ts: manifests may import only @anyfile/viewer-protocol and local data, found ${specifier}`);
    }
  }

  const probePath = join(root, "src/probe.ts");
  if (existsSync(probePath)) {
    const probeMatch = stripComments(read(probePath)).match(PROBE_BROWSER_GLOBALS);
    if (probeMatch) {
      fail(`${probePath}: probes must not access browser-only global "${probeMatch[1]}"`);
    }
  }

  for (const path of sources) {
    const source = read(path);
    const isTest = /\.test\.tsx?$/.test(path);
    for (const [, specifier] of source.matchAll(/(?:from|import\()\s*"(@anyfile\/[a-z0-9-]+)"/g)) {
      if (pluginPackages.has(specifier) && specifier !== pkg.name) {
        fail(`${path}: imports the full ${specifier} viewer; share code through a declared subpath export or a viewer/* package`);
      }
    }
    if (BUNDLER_IGNORE_COMMENT.test(source)) {
      fail(`${path}: do not write bundler ignore comments directly; use importRuntime() from @anyfile/runtime-assets`);
    }
    if (!isTest && INLINE_WASM_URL.test(source)) {
      fail(`${path}: do not inline .wasm via new URL(..., import.meta.url); load from /vendor/<pkg>/<version>/`);
    }
    if (!isTest && RAW_DOM_PARSER.test(stripComments(source))) {
      fail(`${path}: do not call new DOMParser() directly; use @anyfile/runtime-assets/xml`);
    }
  }
}

// Shared viewer/* packages (except @anyfile/runtime-assets) follow the same runtime/XML boundaries.
for (const entry of readdirSync("viewer", { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "plugins" || entry.name === "runtime-assets") continue;
  const sharedSrc = join("viewer", entry.name, "src");
  if (!existsSync(sharedSrc)) continue;
  for (const path of walk(sharedSrc)) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const source = read(path);
    const isTest = /\.test\.tsx?$/.test(path);
    if (BUNDLER_IGNORE_COMMENT.test(source)) {
      fail(`${path}: do not write bundler ignore comments directly; use importRuntime() from @anyfile/runtime-assets`);
    }
    if (!isTest && INLINE_WASM_URL.test(source)) {
      fail(`${path}: do not inline .wasm via new URL(..., import.meta.url); load from /vendor/<pkg>/<version>/`);
    }
    if (!isTest && RAW_DOM_PARSER.test(stripComments(source))) {
      fail(`${path}: do not call new DOMParser() directly; use @anyfile/runtime-assets/xml`);
    }
  }
}

// Dual-host isolation: src/ must never import agent, plugin ./extract, or Node-only runtime/XML helpers; viewer/agent/ must never import src/ or next.
for (const path of walk("src")) {
  if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
  const source = read(path);
  if (/(?:from|import\()\s*["'](?:@anyfile\/agent|@anyfile\/[^"']+\/extract|[^"']*viewer\/agent|@anyfile\/runtime-assets\/node|[^"']*xml\.node\b)/.test(source)) {
    fail(`${path}: Web host (src/) must not import @anyfile/agent, plugin ./extract, or Node-only runtime helpers`);
  }
}
if (existsSync("viewer/agent/src")) {
  for (const path of walk("viewer/agent/src")) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const source = read(path);
    if (/(?:from|import\()\s*["'](?:next(?:\/|$)|@\/|(?:\.\.\/)+src\/)/.test(source)) {
      fail(`${path}: Agent host (viewer/agent/) must not import Next.js or Web host (src/)`);
    }
  }
}

if (errors.length > 0) {
  console.error(`check:repo found ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`check:repo ok (${tracked.length} files, ${pluginDirectories.length} plugins)`);
