import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPluginPolicies, readRegistrationSource } from "./plugin-policies.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const policy = loadPluginPolicies(projectRoot);
const pluginsRoot = join(projectRoot, "viewer/plugins");
const registrationSource = readRegistrationSource(projectRoot);
const discoveredIds = Object.keys(policy.plugins).sort();

for (const id of discoveredIds) {
  const { packageJson } = policy.plugins[id];
  if (packageJson.exports?.["."] !== "./src/index.ts" || packageJson.exports?.["./manifest"] !== "./src/manifest.ts") {
    throw new Error(`${packageJson.name} must export separate viewer and manifest entry points`);
  }
  const manifestImport = `from "${packageJson.name}/manifest"`;
  const viewerImport = `import("${packageJson.name}")`;
  if (!registrationSource.includes(manifestImport) || !registrationSource.includes(viewerImport)) {
    throw new Error(`${packageJson.name} is not statically registered by manifest and dynamically registered by viewer entry`);
  }
  if (packageJson.exports?.["./probe"] && !registrationSource.includes(`import("${packageJson.name}/probe")`)) {
    throw new Error(`${packageJson.name} exports a probe that is not dynamically registered`);
  }
}

function globRegex(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else {
      expression += character.replace(/[\\^$+?.()|{}[\]]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

async function walk(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(relative(projectRoot, path).split(sep).join("/"));
  }
  return files;
}

const runtimeFiles = [
  ...(await walk(join(projectRoot, "public/vendor"))).filter((path) => !path.startsWith("public/vendor/licenses/")),
  ...(await walk(join(projectRoot, ".next/static/media"))).filter((path) => /\.wasm$|worker.*\.(?:js|mjs)$|pdf\.worker.*\.mjs$/i.test(path)),
];
const gzipSizes = new Map();
async function gzipBytes(path) {
  if (!gzipSizes.has(path)) {
    const content = await readFile(join(projectRoot, path));
    gzipSizes.set(path, gzipSync(content, { level: 9 }).byteLength);
  }
  return gzipSizes.get(path);
}

const claimedFiles = new Set();
const reports = [];
const singleLimit = policy.budgets.singleRuntimeAssetGzipMiB * 1024 * 1024;
const coldStartLimit = policy.budgets.coldStartRuntimeGzipMiB * 1024 * 1024;

for (const id of discoveredIds) {
  const pluginPolicy = policy.plugins[id];
  const pluginSourceFiles = (await walk(join(pluginsRoot, pluginPolicy.directory, "src")))
    .filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  const pluginSource = (await Promise.all(pluginSourceFiles.map((path) => readFile(join(projectRoot, path), "utf8")))).join("\n");
  if (/\/vendor\/|cdn\.jsdelivr\.net|assets\.anyfile\.top|new URL\([^\n]+\.wasm/.test(pluginSource)
    && pluginPolicy.runtimeSets.length === 0) {
    throw new Error(`${id} (${pluginPolicy.policyPath}) references runtime assets but declares no runtime set`);
  }

  for (const runtime of pluginPolicy.runtimeSets) {
    if (!runtime.id || !runtime.version || !Array.isArray(runtime.sources) || runtime.sources.length === 0) {
      throw new Error(`${id} (${pluginPolicy.policyPath}) has an incomplete runtime asset declaration`);
    }
    if (runtime.sources.some((source) => !["jsdelivr", "r2", "same-origin"].includes(source))
      || runtime.sources.at(-1) !== "same-origin") {
      throw new Error(`${id}/${runtime.id} has an invalid runtime source order`);
    }
    if (runtime.version.includes("-anyfile.") && runtime.sources.includes("jsdelivr")) {
      throw new Error(`${id}/${runtime.id} is self-built and must not use jsDelivr`);
    }
    if (runtime.versionPackageJson) {
      const versionPackage = JSON.parse(await readFile(join(projectRoot, runtime.versionPackageJson), "utf8"));
      if (versionPackage.version !== runtime.version) {
        throw new Error(`${id}/${runtime.id} policy version ${runtime.version} does not match installed ${versionPackage.version}`);
      }
    }
    if (runtime.sameOriginException && (
      typeof runtime.sameOriginException.reason !== "string"
      || typeof runtime.sameOriginException.architectureDocument !== "string"
      || typeof runtime.sameOriginException.measuredGzipBytes !== "number"
    )) {
      throw new Error(`${id}/${runtime.id} has an incomplete same-origin exception`);
    }
    const matchPatterns = runtime.assetPatterns.map(globRegex);
    const matches = runtimeFiles.filter((path) => matchPatterns.some((pattern) => pattern.test(path)));
    if (matches.length === 0) throw new Error(`${id}/${runtime.id} did not match any built runtime assets`);
    matches.forEach((path) => claimedFiles.add(path));

    const implementation = (await Promise.all((runtime.implementationFiles ?? []).map((path) => (
      readFile(join(projectRoot, path), "utf8")
    )))).join("\n");
    for (const marker of runtime.requiredMarkers ?? []) {
      if (!implementation.includes(marker)) throw new Error(`${id}/${runtime.id} is missing implementation marker: ${marker}`);
    }

    const sizes = await Promise.all(matches.map(async (path) => ({ path, bytes: await gzipBytes(path) })));
    const largest = sizes.reduce((current, item) => item.bytes > current.bytes ? item : current, sizes[0]);
    let largestColdStart = { id: "none", bytes: 0 };
    for (const group of runtime.coldStartGroups) {
      const patterns = group.assetPatterns.map(globRegex);
      const groupFiles = matches.filter((path) => patterns.some((pattern) => pattern.test(path)));
      if (groupFiles.length === 0) throw new Error(`${id}/${runtime.id}/${group.id} did not match any runtime assets`);
      const bytes = (await Promise.all(groupFiles.map(gzipBytes))).reduce((total, size) => total + size, 0);
      if (bytes > largestColdStart.bytes) largestColdStart = { id: group.id, bytes };
    }

    if (largest.bytes >= singleLimit || largestColdStart.bytes >= coldStartLimit) {
      const validExternalChain = ["jsdelivr,r2,same-origin", "r2,same-origin"].includes(runtime.sources.join(","));
      if (!validExternalChain && !runtime.sameOriginException) {
        throw new Error(`${id}/${runtime.id} exceeds the runtime transfer threshold without an external asset chain or documented exception`);
      }
    }
    reports.push({ id, runtime: runtime.id, largest, coldStart: largestColdStart, sources: runtime.sources });
  }
}

const unclaimed = runtimeFiles.filter((path) => !claimedFiles.has(path));
if (unclaimed.length > 0) {
  throw new Error(`Built runtime assets are missing from viewer/plugins/*/policy.json: ${unclaimed.join(", ")}`);
}

for (const report of reports) {
  console.log(`${report.id}/${report.runtime}: largest ${(report.largest.bytes / 1024).toFixed(1)} KiB gzip; cold start ${report.coldStart.id} ${(report.coldStart.bytes / 1024).toFixed(1)} KiB gzip; ${report.sources.join(" -> ")}`);
}
console.log(`${discoveredIds.length} viewer plugin policies cover ${runtimeFiles.length} built runtime assets`);
