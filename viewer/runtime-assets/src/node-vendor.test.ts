// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readLocalVendorAsset,
  resolveVendorAssetPath,
  resolveVerifiedVendorAssetUrl,
  sha256Hex,
} from "./node-vendor";
import { parseXmlDocument } from "./xml.node";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("@anyfile/runtime-assets Node XML & local vendor loader", () => {
  it("parses XML documents in Node without global DOMParser", () => {
    const doc = parseXmlDocument(`<root><item id="1">hello</item></root>`, "application/xml");
    const item = doc.getElementsByTagName("item")[0];
    expect(item?.getAttribute("id")).toBe("1");
    expect(item?.textContent).toBe("hello");
  });

  it("reads and verifies local vendor assets by SHA-256", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "anyfile-vendor-test-"));
    tempDirs.push(cacheDir);
    const assetDir = join(cacheDir, "vendor", "sample-pkg", "1.0.0");
    await mkdir(assetDir, { recursive: true });
    const payload = new TextEncoder().encode("wasm-bytes");
    await writeFile(join(assetDir, "sample.wasm"), payload);
    const digest = sha256Hex(payload);

    const bytes = await readLocalVendorAsset(
      { pkg: "sample-pkg", version: "1.0.0", file: "sample.wasm", sha256: digest },
      { cacheDir },
    );
    expect(bytes).toEqual(payload);

    const url = await resolveVerifiedVendorAssetUrl(
      { pkg: "sample-pkg", version: "1.0.0", file: "sample.wasm", sha256: digest },
      { cacheDir },
    );
    expect(url.startsWith("file://")).toBe(true);

    await expect(readLocalVendorAsset(
      { pkg: "sample-pkg", version: "1.0.0", file: "sample.wasm", sha256: "0".repeat(64) },
      { cacheDir },
    )).rejects.toThrow(/SHA-256 mismatch/);
  });

  it("blocks path traversal in vendor asset spec", () => {
    expect(() => resolveVendorAssetPath({ pkg: "../etc", version: "1.0.0", file: "passwd" })).toThrow();
    expect(() => resolveVendorAssetPath({ pkg: "pkg", version: "1.0.0", file: "../../secret" })).toThrow();
  });
});
