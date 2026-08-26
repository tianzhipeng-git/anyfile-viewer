import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const html = await readFile(join(projectRoot, ".next/server/app/view.html"), "utf8");
const assets = [...new Set(
  [...html.matchAll(/src="\/_next\/(static\/chunks\/[^"?]+\.js)/g)].map((match) => match[1]),
)];

if (assets.length === 0) {
  throw new Error("No initial JavaScript assets were found for /view");
}

const contents = await Promise.all(
  assets.map((asset) => readFile(join(projectRoot, ".next", asset))),
);
const gzipBytes = contents.reduce((total, content) => total + gzipSync(content).byteLength, 0);
const maximumGzipBytes = 225 * 1024;
if (gzipBytes > maximumGzipBytes) {
  throw new Error(
    `/view initial JavaScript is ${(gzipBytes / 1024).toFixed(1)} KiB gzip; maximum is ${maximumGzipBytes / 1024} KiB`,
  );
}

const initialCode = Buffer.concat(contents).toString("utf8");
const deferredImplementationMarkers = [
  "ace-builds",
  "Starting DuckDB",
  "Starting SQLite",
  "InvalidSpreadsheetError",
];
const bundledMarker = deferredImplementationMarkers.find((marker) => initialCode.includes(marker));
if (bundledMarker) {
  throw new Error(`/view initial JavaScript contains deferred viewer implementation: ${bundledMarker}`);
}

console.log(`/view initial JavaScript: ${(gzipBytes / 1024).toFixed(1)} KiB gzip across ${assets.length} files`);
