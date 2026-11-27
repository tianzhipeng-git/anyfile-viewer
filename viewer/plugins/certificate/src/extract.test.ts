// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HARD_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };
const bytesOf = (name: string) => new Uint8Array(readFileSync(resolve(EXAMPLES, name)));
const fixture = (name: string, extra: object = {}) => ({ name, filePath: resolve(EXAMPLES, name), ...extra });

function context(name: string, bytes = bytesOf(name)): ExtractContext {
  return {
    source: createBufferBinarySource(bytes, name),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

/** The chain sample followed by its throwaway private key, as many server bundles ship. */
const bundle = () => new Uint8Array([...bytesOf("sample-chain.pem"), ...bytesOf("disguised-private-key.pem")]);

describe("certificate ./extract", () => {
  it("passes extractor compliance on PEM, DER and chain samples", async () => {
    await assertExtractorCompliance(extractor, [
      fixture("sample-chain.pem", { invalidBytes: bytesOf("corrupt-cert.crt"), filter: "dns", smallMaxBytes: 200 }),
      fixture("isrg-root-x1.pem", { targetId: "cert:1" }),
      fixture("sample-leaf.der", { invalidBytes: bytesOf("truncated-cert.der") }),
      fixture("sample-ec.pem"),
      { name: "bundle.pem", bytes: bundle(), targetId: "keys", invalidBytes: bytesOf("disguised-private-key.pem") },
    ]);
  });

  it("decodes subject, validity, SANs, key and fingerprints", async () => {
    const inspected = await extractor.inspect(context("sample-chain.pem"));
    expect(inspected.metadata).toMatchObject({ encoding: "PEM", certificateCount: 2, privateKeyPresent: false });
    expect(inspected.targets.map(({ id }) => id)).toEqual(["all", "cert:1", "cert:2"]);

    const leaf = await extractor.read(context("sample-leaf.der"), { target: "cert:1", maxBytes: HARD_READ_MAX_BYTES });
    expect(leaf.content).toContain("CN=www.example.anyfile.invalid");
    expect(leaf.content).toContain("- **Not after**: 2027-11-21T07:24:54.000Z");
    expect(leaf.content).toContain("IP: 203.0.113.7");
    expect(leaf.content).toContain("- **Public key**: RSA 2048 bits");
    expect(leaf.content).toMatch(/- \*\*SHA-256 fingerprint\*\*: 73:AD:20:B7(:[0-9A-F]{2}){28}/);

    const root = await extractor.read(context("isrg-root-x1.pem"), { maxBytes: HARD_READ_MAX_BYTES });
    expect(root.content).toContain("- **Public key**: RSA 4096 bits");
    expect(root.content).toContain("- **CA**: yes");
    const ec = await extractor.read(context("sample-ec.pem"), { filter: "public key", maxBytes: HARD_READ_MAX_BYTES });
    expect(ec.content).toBe("- **Public key**: EC P-256");
  });

  it("reports bundled private keys by type only", async () => {
    const keyBody = new TextDecoder().decode(bytesOf("disguised-private-key.pem")).split("\n")[1]!;
    const inspected = await extractor.inspect(context("bundle.pem", bundle()));
    expect(inspected.metadata).toMatchObject({ privateKeyPresent: true, privateKeys: ["PRIVATE KEY: RSA"] });
    const all = await extractor.read(context("bundle.pem", bundle()), { maxBytes: HARD_READ_MAX_BYTES });
    expect(all.content).toContain("- `PRIVATE KEY`: private key, RSA (key material not shown)");
    expect(all.content).not.toContain(keyBody);
    expect(JSON.stringify(inspected)).not.toContain(keyBody);
  });
});
