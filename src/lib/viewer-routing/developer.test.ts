import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findViewerRegistrations, resolveViewerRegistrations } from "@anyfile/viewer-protocol";
import { viewerRegistrations } from "../viewer-registrations";

describe("developer, data and archive routing", () => {
  it("resolves code, database, developer artifact and archive probes", async () => {
    const source = await resolveViewerRegistrations(
      new File(["export const answer = 42;\n"], "answer.ts"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(source.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["ace-code-text", 3], ["hex-viewer", 1]]);

    const sqlite = await resolveViewerRegistrations(
      new File(["SQLite format 3\0payload"], "database.db"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(sqlite.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["sqlite-database", 5], ["hex-viewer", 1]]);

    const npyBytes = readFileSync(join(process.cwd(), "viewer/plugins/dev-array/examples/matrix.npy"));
    const npy = await resolveViewerRegistrations(
      new File([npyBytes], "matrix.npy"), viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(npy.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["dev-array-viewer", 3], ["hex-viewer", 1]]);

    const wasm = await resolveViewerRegistrations(
      new File([Uint8Array.of(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0)], "module.wasm"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(wasm.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["dev-wasm-viewer", 2], ["hex-viewer", 1]]);

    const sourceMap = await resolveViewerRegistrations(
      new File(['{"version":3,"sources":[],"names":[],"mappings":""}'], "bundle.js.map"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(sourceMap.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["dev-source-map-viewer", 3], ["hex-viewer", 1]]);

    for (const nativeName of ["sample.elf", "sample.dll", "sample-universal.dylib", "sample.a", "sample.obj"]) {
      const nativeBytes = readFileSync(join(process.cwd(), "viewer/plugins/dev-native-binary/examples", nativeName));
      const nativeResolved = await resolveViewerRegistrations(
        new File([nativeBytes], nativeName),
        viewerRegistrations,
        { signal: new AbortController().signal },
      );
      expect(nativeResolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
        .toEqual([["dev-native-binary-viewer", 1], ["hex-viewer", 1]]);
    }

    const duckdb = await resolveViewerRegistrations(
      new File([], "database.duckdb"), viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(duckdb.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["duckdb-data", 3], ["hex-viewer", 1]]);

    const tgzBytes = readFileSync(join(process.cwd(), "viewer/plugins/archive/examples/package.tgz"));
    const tgz = await resolveViewerRegistrations(
      new File([tgzBytes], "package.tgz"), viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(tgz.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["archive-metadata-viewer", 2], ["hex-viewer", 1]]);
  });

  it("orders developer, structured data and archive candidates ahead of hex fallback", () => {
    expect(findViewerRegistrations("rows.csv.gz", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["duckdb-data", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("network.har", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["http-archive", "hex-viewer"]);
    expect(findViewerRegistrations("movie.torrent", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["bittorrent-metadata", "hex-viewer"]);
    for (const extension of ["safetensors", "gguf"]) {
      expect(findViewerRegistrations(`model.${extension}`, viewerRegistrations).map(({ manifest }) => manifest.id))
        .toEqual(["ml-weights", "hex-viewer"]);
    }
    for (const extension of ["pem", "crt", "cer", "der"]) {
      expect(findViewerRegistrations(`server.${extension}`, viewerRegistrations).map(({ manifest }) => manifest.id))
        .toEqual(["x509-certificate", "hex-viewer"]);
    }
    expect(findViewerRegistrations("module.wasm", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["dev-wasm-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("bundle.js.map", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["dev-source-map-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("program.elf", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["dev-native-binary-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("addon.node", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["dev-native-binary-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("database.duckdb", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["duckdb-data", "hex-viewer"]);
    expect(findViewerRegistrations("backup.tar.gz", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("backup.rar", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["archive-metadata-viewer", "hex-viewer"]);
  });
});
