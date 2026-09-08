import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const recipe = dirname(fileURLToPath(import.meta.url)), root = resolve(recipe, "../..");
const build = resolve(process.argv[2]);
const upstream = JSON.parse(await readFile(join(recipe, "upstream.json"), "utf8"));
const output = join(root, "third_party/ffmpeg-playback", upstream.artifactVersion);
const sourceInfo = JSON.parse(await readFile(join(build, "build-info.json"), "utf8"));
for (const name of ["bridge.c", "bridge.h", "output.c", "seek.c", "link-in-container.sh"]) {
  const hash = createHash("sha256").update(await readFile(join(recipe, name))).digest("hex");
  if (sourceInfo.adapterSources[name] !== hash) throw new Error(`${name} changed; rebuild/relink before assembly`);
}
for (const name of ["ffmpeg-playback.js", "ffmpeg-playback.wasm", "configure.txt", "config.h"]) {
  const hash = createHash("sha256").update(await readFile(join(build, name))).digest("hex");
  if (sourceInfo.artifacts[name].sha256 !== hash) throw new Error(`Corrupt build artifact: ${name}`);
}
for (const [name, expected] of Object.entries(sourceInfo.relinkInputs)) {
  const hash = createHash("sha256").update(await readFile(join(build, "relink", name))).digest("hex");
  if (expected !== hash) throw new Error(`Corrupt relink input: ${name}`);
}
await mkdir(output, { recursive: true });
for (const name of ["ffmpeg-playback.js", "ffmpeg-playback.wasm", "LICENSE.FFmpeg", "LICENSE.Emscripten", "configure.txt", "config.h"]) await cp(join(build, name), join(output, name));
await cp(join(recipe, "worker.js"), join(output, "ffmpeg-playback.worker.js"));
await cp(join(recipe, "SOURCE.md"), join(output, "SOURCE.md"));
await cp(join(root, "LICENSE"), join(output, "LICENSE.Adapter"));
await cp(join(build, "relink/source.tar.xz"), join(output, "ffmpeg-source.tar.xz"));
const temporary = await mkdtemp(join(tmpdir(), "ffmpeg-relink-materials-"));
try {
  const source = join(temporary, "tools/ffmpeg-playback-build"); await mkdir(source, { recursive: true });
  for (const name of ["bridge.c", "bridge.h", "output.c", "seek.c", "worker.js", "upstream.json", "build.sh", "build-in-container.sh", "link-in-container.sh", "relink.sh", "write-build-info.mjs", "SOURCE.md"]) await cp(join(recipe, name), join(source, name));
  const libraries = join(temporary, "relink"); await mkdir(libraries);
  for (const name of Object.keys(sourceInfo.relinkInputs).filter(name => name !== "source.tar.xz")) await cp(join(build, "relink", name), join(libraries, name));
  execFileSync("python3", ["-c", `
import gzip, pathlib, sys, tarfile
root = pathlib.Path(sys.argv[1])
with open(sys.argv[2], "wb") as output:
  with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode="w", format=tarfile.GNU_FORMAT) as archive:
      for path in sorted(root.rglob("*")):
        info = archive.gettarinfo(str(path), str(path.relative_to(root)))
        info.uid = info.gid = info.mtime = 0
        info.uname = info.gname = ""
        info.mode = 0o755 if path.is_dir() or path.suffix == ".sh" else 0o644
        if path.is_file():
          with path.open("rb") as source: archive.addfile(info, source)
        else: archive.addfile(info)
`, temporary, join(output, "relink-materials.tar.gz")]);
} finally { await rm(temporary, { recursive: true }); }
const names = ["ffmpeg-playback.js", "ffmpeg-playback.wasm", "ffmpeg-playback.worker.js", "SOURCE.md", "LICENSE.Adapter", "LICENSE.FFmpeg", "LICENSE.Emscripten", "ffmpeg-source.tar.xz", "relink-materials.tar.gz", "configure.txt", "config.h"];
const artifacts = {};
for (const name of names) {
  const data = await readFile(join(output, name));
  artifacts[name] = { bytes: data.length, gzipBytes: gzipSync(data).length, sha256: createHash("sha256").update(data).digest("hex") };
}
const workerHash = createHash("sha256").update(await readFile(join(recipe, "worker.js"))).digest("hex");
await writeFile(join(output, "build-info.json"), `${JSON.stringify({ ...sourceInfo, status: "playback-runtime", adapterSources: { ...sourceInfo.adapterSources, "worker.js": workerHash }, artifacts }, null, 2)}\n`);
console.log(output);
