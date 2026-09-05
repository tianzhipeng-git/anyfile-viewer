import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const policy = JSON.parse(await readFile(join(projectRoot, "viewer/plugin-policies.json"), "utf8"));
const loadableManifest = JSON.parse(await readFile(
  join(projectRoot, ".next/react-loadable-manifest.json"),
  "utf8",
));

async function entryGzipBytes(specifier) {
  const suffix = `viewer-registrations.ts -> ${specifier}`;
  const entries = Object.entries(loadableManifest)
    .filter(([key]) => key.endsWith(suffix));
  const files = new Set(entries.flatMap(([, entry]) => entry.files).filter((file) => file.endsWith(".js")));
  if (files.size === 0) throw new Error(`No client dynamic chunk group found for ${specifier}`);
  const contents = await Promise.all([...files].map((file) => readFile(join(projectRoot, ".next", file))));
  return {
    bytes: contents.reduce((total, content) => total + gzipSync(content, { level: 9 }).byteLength, 0),
    files: [...files].sort(),
  };
}

const report = { schemaVersion: 1, plugins: {} };
const manifestLimit = policy.budgets.manifestGzipKiB * 1024;
const probeLimit = policy.budgets.probeGzipKiB * 1024;
const viewerLimit = policy.budgets.viewerGzipKiB * 1024;
const chunkDirectory = join(projectRoot, ".next/static/chunks");
const oversizedChunks = [];
for (const file of await readdir(chunkDirectory)) {
  if (!file.endsWith(".js")) continue;
  const bytes = gzipSync(await readFile(join(chunkDirectory, file)), { level: 9 }).byteLength;
  if (bytes > viewerLimit) oversizedChunks.push({ file, bytes });
}
if (oversizedChunks.length > 0) {
  throw new Error(`Client JavaScript chunks exceed ${policy.budgets.viewerGzipKiB} KiB gzip: ${oversizedChunks.map(({ file, bytes }) => `${file} (${(bytes / 1024).toFixed(1)} KiB)`).join(", ")}`);
}

for (const [id, plugin] of Object.entries(policy.plugins)) {
  const packageJson = JSON.parse(await readFile(
    join(projectRoot, "viewer/plugins", plugin.directory, "package.json"),
    "utf8",
  ));
  const manifestSource = await readFile(
    join(projectRoot, "viewer/plugins", plugin.directory, packageJson.exports["./manifest"]),
  );
  const manifestBytes = gzipSync(manifestSource, { level: 9 }).byteLength;
  if (manifestBytes > manifestLimit) {
    throw new Error(`${id} manifest source is ${(manifestBytes / 1024).toFixed(1)} KiB gzip; maximum is ${policy.budgets.manifestGzipKiB} KiB`);
  }

  const viewer = await entryGzipBytes(plugin.package);
  if (viewer.bytes > viewerLimit) {
    throw new Error(`${id} viewer entry is ${(viewer.bytes / 1024).toFixed(1)} KiB gzip; maximum is ${policy.budgets.viewerGzipKiB} KiB`);
  }
  const probe = packageJson.exports["./probe"]
    ? await entryGzipBytes(`${plugin.package}/probe`)
    : undefined;
  if (probe && probe.bytes > probeLimit) {
    throw new Error(`${id} probe entry is ${(probe.bytes / 1024).toFixed(1)} KiB gzip; maximum is ${policy.budgets.probeGzipKiB} KiB`);
  }

  report.plugins[id] = {
    manifestSourceGzipBytes: manifestBytes,
    probeGzipBytes: probe?.bytes ?? 0,
    probeFiles: probe?.files ?? [],
    viewerGzipBytes: viewer.bytes,
    viewerFiles: viewer.files,
  };
  console.log(`${id}: manifest ${(manifestBytes / 1024).toFixed(1)} KiB source gzip; probe ${((probe?.bytes ?? 0) / 1024).toFixed(1)} KiB; viewer ${(viewer.bytes / 1024).toFixed(1)} KiB`);
}

for (const [id, ownMarker, otherMarker] of [
  ["epub-reader", "anyfile-epub-reader__viewport", "anyfile-comic-reader__viewport"],
  ["comic-book-reader", "anyfile-comic-reader__viewport", "anyfile-epub-reader__viewport"],
]) {
  const entry = report.plugins[id];
  const code = (await Promise.all(entry.viewerFiles.map((file) => readFile(join(projectRoot, ".next", file), "utf8")))).join("\n");
  if (!code.includes(ownMarker) || code.includes(otherMarker)) throw new Error(`${id} renderer is not isolated in its own dynamic entry`);
  const probeCode = (await Promise.all(entry.probeFiles.map((file) => readFile(join(projectRoot, ".next", file), "utf8")))).join("\n");
  for (const marker of [ownMarker, otherMarker, "ZIP expansion limit exceeded.", "Chapter resource count exceeded."]) {
    if (probeCode.includes(marker)) throw new Error(`${id} probe imports a decoder or renderer: ${marker}`);
  }
}

await writeFile(
  join(projectRoot, ".next/diagnostics/viewer-bundle-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
