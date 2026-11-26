import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks, stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let registered = false;
let tsModule = null;

function getTypeScript() {
  if (!tsModule) {
    const req = createRequire(import.meta.url);
    tsModule = req("typescript");
  }
  return tsModule;
}

export function registerTsHooks() {
  if (registered) return;
  registered = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (context.parentURL?.startsWith("file:") && (specifier.startsWith("./") || specifier.startsWith("../"))) {
          const base = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
          for (const candidate of [`${base}.ts`, `${base}.mts`, `${base}/index.ts`]) {
            if (existsSync(candidate)) {
              return nextResolve(pathToFileURL(candidate).href, context);
            }
          }
        }
        throw error;
      }
    },
    load(url, context, nextLoad) {
      if (url.startsWith("file:") && (url.endsWith(".ts") || url.endsWith(".mts"))) {
        const filePath = fileURLToPath(url);
        const source = readFileSync(filePath, "utf8");
        try {
          const stripped = stripTypeScriptTypes(source, { mode: "strip" });
          return { format: "module", shortCircuit: true, source: stripped };
        } catch (error) {
          if (error && typeof error === "object" && error.code === "ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX") {
            const ts = getTypeScript();
            const transpiled = ts.transpileModule(source, {
              fileName: filePath,
              compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2022,
                verbatimModuleSyntax: false,
              },
            });
            return { format: "module", shortCircuit: true, source: transpiled.outputText };
          }
          throw error;
        }
      }
      return nextLoad(url, context);
    },
  });
}

registerTsHooks();
