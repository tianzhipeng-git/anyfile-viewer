import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assertReadsWithin, createTrackedFile } from "@anyfile/viewer-test";

import { inspectCertificate } from "./probe";

const examples = join(process.cwd(), "examples");
const read = (name: string) => new Uint8Array(readFileSync(join(examples, name)));

function context(name: string) {
  return { file: new File([read(name)], name), signal: new AbortController().signal };
}

describe("X.509 certificate probe", () => {
  it("recognizes PEM bundles, single certificates and DER files", async () => {
    await expect(inspectCertificate(context("sample-chain.pem"))).resolves.toBe(4);
    await expect(inspectCertificate(context("isrg-root-x1.pem"))).resolves.toBe(4);
    await expect(inspectCertificate(context("sample-leaf.der"))).resolves.toBe(4);
  });

  it("rejects private keys, disguised text, corrupt and truncated files", async () => {
    for (const name of ["disguised-private-key.pem", "corrupt-cert.crt", "truncated-cert.der"]) {
      await expect(inspectCertificate(context(name)), name).resolves.toBe(0);
    }
  });

  it("reads only a bounded header", async () => {
    const { file, reads } = createTrackedFile(read("sample-chain.pem"), "chain.pem");
    await inspectCertificate({ file, signal: new AbortController().signal });
    expect(reads.length).toBe(1);
    assertReadsWithin(reads, [{ start: 0, end: 16 * 1024 }]);
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(inspectCertificate({ file: new File([read("sample-chain.pem")], "chain.pem"), signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
  });
});
