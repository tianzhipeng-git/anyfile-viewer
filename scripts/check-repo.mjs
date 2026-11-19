// Fast structural guard (no build). Run: pnpm check:repo
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const MAX_LINES = 1000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const LINE_CHECKED = /\.(ts|tsx|mts|mjs|cjs|js|css|md|py|sh|c|cc|cpp|h|go)$/;
const UNCHECKED_PATHS = /^(third_party|licenses|\.agents|public)\/|\/(examples|fixtures|validation)\//;
// Large tracked files that predate this check. Do not add to this list; keep samples small.
const LARGE_FILE_ALLOWLIST = new Set(["docs/ebooks/fixtures/huge-binary.fb2"]);
// Plugins that predate the real-sample rule. Remove an entry once the plugin gains examples/.
const PLUGINS_WITHOUT_SAMPLES = new Set([
  "cad-dwg", "cad-exchange", "camera-raw", "code", "comic-book", "dev-wasm", "dji-osmo", "epub", "ffmpeg-audio", "ffmpeg-video",
  "fictionbook", "gopro-max", "hex", "insta360", "mobi", "pixelmator-pxd", "powerpoint", "sqlite",
]);
// Registered plugins without a site page in src/content/manifests.ts.
// epub has a format page but no plugin page yet; ffmpeg viewers are fallbacks.
const UNPUBLISHED_PLUGINS = new Set(["epub", "ffmpeg-audio", "ffmpeg-video"]);
const SAMPLE_DIRECTORIES = ["examples", "fixtures"];
const NON_SAMPLE = /^(readme|license|notice|sources?)(\.|$)|\.(md|json|txt|py|mjs|ts)$/i;

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

// Plugin wiring.
const policies = readJson("viewer/plugin-policies.json").plugins;
const rootDependencies = readJson("package.json").dependencies;
const registrations = read("src/lib/viewer-registrations.ts");
const contentManifests = read("src/content/manifests.ts");
const pluginDirectories = readdirSync("viewer/plugins").filter((name) => statSync(join("viewer/plugins", name)).isDirectory());
const pluginPackages = new Map(pluginDirectories.map((name) => [readJson(join("viewer/plugins", name, "package.json")).name, name]));
const policyDirectories = new Map(Object.entries(policies).map(([id, policy]) => [policy.directory, id]));

for (const [id, policy] of Object.entries(policies)) {
  if (!pluginDirectories.includes(policy.directory)) fail(`plugin-policies.json: ${id} points to missing viewer/plugins/${policy.directory}`);
}

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
  if (!policyDirectories.has(name)) fail(`${where}: missing from viewer/plugin-policies.json`);
  if (policies[policyDirectories.get(name)]?.package !== pkg.name) fail(`${where}: plugin-policies.json package must be ${pkg.name}`);
  if (pkg.exports?.["./manifest"] !== "./src/manifest.ts") fail(`${where}: package.json must export ./manifest from ./src/manifest.ts`);
  if (rootDependencies[pkg.name] !== "workspace:*") fail(`${where}: root package.json must depend on ${pkg.name}`);
  if (!registrations.includes(`"${pkg.name}/manifest"`)) fail(`${where}: not registered in src/lib/viewer-registrations.ts`);
  if (contentManifests.includes(`"${pkg.name}/manifest"`) === UNPUBLISHED_PLUGINS.has(name)) fail(`${where}: add it to src/content/manifests.ts (site pages) or UNPUBLISHED_PLUGINS`);
  if (!existsSync(join(root, "README.md"))) fail(`${where}: missing README.md`);

  const sources = walk(join(root, "src"));
  if (!sources.some((path) => /\.test\.ts$/.test(path))) fail(`${where}: has no *.test.ts`);

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

  for (const path of sources) {
    for (const [, specifier] of read(path).matchAll(/(?:from|import\()\s*"(@anyfile\/[a-z0-9-]+)"/g)) {
      if (pluginPackages.has(specifier) && specifier !== pkg.name) {
        fail(`${path}: imports the full ${specifier} viewer; share code through a declared subpath export or a viewer/* package`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`check:repo found ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`check:repo ok (${tracked.length} files, ${pluginDirectories.length} plugins)`);
