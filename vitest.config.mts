import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));
const packages = ["viewer", "viewer/plugins"]
  .flatMap(parent => readdirSync(resolve(root, parent)).map(name => `${parent}/${name}`))
  .filter(directory => existsSync(resolve(root, directory, "package.json")));

export default defineConfig({
  resolve: { alias: { "@": resolve(root, "src") } },
  test: {
    environment: "happy-dom",
    restoreMocks: true,
    // Node >= 25 ships a global localStorage that shadows happy-dom's.
    execArgv: Number(process.versions.node.split(".")[0]) >= 25 ? ["--no-experimental-webstorage"] : [],
    environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true, disableIframePageLoading: true, disableJavaScriptEvaluation: true } } },
    projects: [
      { extends: true, test: { name: "app", include: ["src/**/*.test.ts"] } },
      ...packages.map(directory => ({
        extends: true as const,
        root: resolve(root, directory),
        // Package tests resolve fixtures from their own directory.
        test: { name: directory, env: { VITEST_PACKAGE_ROOT: resolve(root, directory) }, setupFiles: [resolve(root, "scripts/vitest-package-cwd.ts")] },
      })),
    ],
  },
});
