import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveViewerRegistrations } from "@anyfile/viewer-protocol";
import policies from "../../viewer/plugin-policies.json";
import { viewerRegistrations } from "./viewer-registrations";

// Every positive real sample in a plugin's examples/ or fixtures/ must route to that plugin.
// Negative samples carry one of NEGATIVE_SAMPLE in the file name; plugin tests own their behavior.
const SAMPLE_DIRECTORIES = ["examples", "fixtures"];
const NON_SAMPLE = /^(readme|license|notice|sources?)(\.|$)|\.(md|json|txt|py|mjs|ts)$/i;
const NEGATIVE_SAMPLE = /disguised|truncated|corrupt|invalid|unsupported|counterexample/i;
// Probes that ask the browser's media decoders; happy-dom cannot answer them.
const BROWSER_CODEC_PROBES = new Set(["browser-audio", "browser-video", "non-native-audio", "non-native-video"]);

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const cases = Object.entries(policies.plugins)
  .filter(([id]) => !BROWSER_CODEC_PROBES.has(id))
  .flatMap(([id, { directory }]) => {
    const manifest = viewerRegistrations.find(({ manifest: item }) => item.id === id)!.manifest;
    const claims = (name: string) => manifest.formats.some(format =>
      format.extensions.some(extension => extension === "*" || name.endsWith(extension))
      || format.fileNames?.some(fileName => fileName.toLowerCase() === name));
    return SAMPLE_DIRECTORIES.flatMap(sub => {
      const root = join(process.cwd(), "viewer/plugins", directory, sub);
      try { statSync(root); } catch { return []; }
      return walk(root)
        .filter(path => {
          const name = basename(path).toLowerCase();
          return !NON_SAMPLE.test(name) && !NEGATIVE_SAMPLE.test(name) && claims(name);
        })
        .map(path => [relative(process.cwd(), path), id]);
    });
  });

describe("plugin real samples", () => {
  it.each(cases)("%s routes to %s", async (path, id) => {
    const file = new File([readFileSync(path)], basename(path));
    const result = await resolveViewerRegistrations(file, viewerRegistrations, { signal: new AbortController().signal });
    expect(result.map(({ registration }) => registration.manifest.id)).toContain(id);
  });
});
