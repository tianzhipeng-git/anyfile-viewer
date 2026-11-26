import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BUDGET_KEYS = [
  "manifestGzipKiB",
  "probeGzipKiB",
  "viewerGzipKiB",
  "singleRuntimeAssetGzipMiB",
  "coldStartRuntimeGzipMiB",
];
const PLUGIN_POLICY_KEYS = new Set(["runtimeSets"]);

/**
 * @typedef {{
 *   manifestGzipKiB: number;
 *   probeGzipKiB: number;
 *   viewerGzipKiB: number;
 *   singleRuntimeAssetGzipMiB: number;
 *   coldStartRuntimeGzipMiB: number;
 * }} PluginBudgets
 *
 * @typedef {{
 *   id: string;
 *   version: string;
 *   versionPackageJson?: string;
 *   assetPatterns: string[];
 *   coldStartGroups: { id: string; assetPatterns: string[] }[];
 *   sources: string[];
 *   implementationFiles?: string[];
 *   requiredMarkers?: string[];
 *   sameOriginException?: {
 *     reason: string;
 *     architectureDocument: string;
 *     measuredGzipBytes: number;
 *   };
 * }} RuntimeAssetSet
 *
 * @typedef {{
 *   id: string;
 *   directory: string;
 *   package: string;
 *   packageJson: { name: string; exports?: Record<string, string> };
 *   policyPath: string;
 *   runtimeSets: RuntimeAssetSet[];
 * }} LoadedPluginPolicy
 *
 * @typedef {{
 *   schemaVersion: 2;
 *   budgets: PluginBudgets;
 *   plugins: Record<string, LoadedPluginPolicy>;
 * }} PluginPolicyConfig
 */

/**
 * @param {string} projectRoot
 * @returns {{ schemaVersion: 2; budgets: PluginBudgets }}
 */
export function loadGlobalPluginPolicy(projectRoot) {
  const path = join(projectRoot, "viewer/plugin-policies.json");
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed?.schemaVersion !== 2) {
    throw new Error("viewer/plugin-policies.json must declare schemaVersion 2");
  }
  if ("plugins" in parsed) {
    throw new Error("viewer/plugin-policies.json must not contain plugins; move per-plugin policy to viewer/plugins/<dir>/policy.json");
  }
  const budgets = parsed.budgets;
  if (!budgets || typeof budgets !== "object") {
    throw new Error("viewer/plugin-policies.json is missing budgets");
  }
  for (const key of BUDGET_KEYS) {
    if (typeof budgets[key] !== "number" || !Number.isFinite(budgets[key]) || budgets[key] <= 0) {
      throw new Error(`viewer/plugin-policies.json has invalid budget ${key}`);
    }
  }
  return { schemaVersion: 2, budgets };
}

/**
 * @param {string} pluginRoot
 * @returns {{ runtimeSets: RuntimeAssetSet[] }}
 */
export function readPluginPolicyFile(pluginRoot) {
  const path = join(pluginRoot, "policy.json");
  if (!existsSync(path)) {
    throw new Error(`missing policy.json in ${pluginRoot}`);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object`);
  }
  for (const key of Object.keys(parsed)) {
    if (!PLUGIN_POLICY_KEYS.has(key)) {
      throw new Error(`${path} contains unsupported key "${key}"`);
    }
  }
  if (!Array.isArray(parsed.runtimeSets)) {
    throw new Error(`${path} must declare a runtimeSets array`);
  }
  return { runtimeSets: parsed.runtimeSets };
}

/**
 * @param {string} manifestSource
 * @returns {string | undefined}
 */
export function extractManifestId(manifestSource) {
  return manifestSource.match(/\bid:\s*["']([^"']+)["']/)?.[1];
}

/**
 * @param {string} projectRoot
 * @returns {PluginPolicyConfig}
 */
export function loadPluginPolicies(projectRoot) {
  const globalPolicy = loadGlobalPluginPolicy(projectRoot);
  const pluginsRoot = join(projectRoot, "viewer/plugins");
  const directories = readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  /** @type {Record<string, LoadedPluginPolicy>} */
  const plugins = {};
  for (const directory of directories) {
    const root = join(pluginsRoot, directory);
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const manifestSource = readFileSync(join(root, "src/manifest.ts"), "utf8");
    const id = extractManifestId(manifestSource);
    if (!id) throw new Error(`Viewer plugin ${directory} has no literal manifest id`);
    if (id in plugins) throw new Error(`Duplicate viewer plugin id ${id}`);
    const { runtimeSets } = readPluginPolicyFile(root);
    plugins[id] = {
      id,
      directory,
      package: packageJson.name,
      packageJson,
      policyPath: `viewer/plugins/${directory}/policy.json`,
      runtimeSets,
    };
  }

  return { ...globalPolicy, plugins };
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
export function readRegistrationSource(projectRoot) {
  const sources = [readFileSync(join(projectRoot, "src/lib/viewer-registrations.ts"), "utf8")];
  const registryRoot = join(projectRoot, "viewer/registry/src");
  if (existsSync(registryRoot)) {
    const collect = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) collect(fullPath);
        else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          sources.push(readFileSync(fullPath, "utf8"));
        }
      }
    };
    collect(registryRoot);
  }
  return sources.join("\n");
}
