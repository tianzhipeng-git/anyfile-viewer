import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Asn1Error } from "./asn1";
import { parseCertificate, readPemBlocks } from "./certificate";

const examples = join(process.cwd(), "examples");
const read = (name: string) => new Uint8Array(readFileSync(join(examples, name)));
const pem = (name: string) => new TextDecoder().decode(read(name));

function firstPemCertificate(name: string) {
  const block = readPemBlocks(pem(name)).find(({ label }) => label === "CERTIFICATE");
  if (!block) throw new Error(`No certificate in ${name}`);
  return block.der;
}

describe("X.509 certificate parsing", () => {
  it("reads the downloaded ISRG Root X1 certificate", () => {
    const report = parseCertificate(firstPemCertificate("isrg-root-x1.pem"));
    expect(report.version).toBe(3);
    expect(report.subject.display).toBe("C=US, O=Internet Security Research Group, CN=ISRG Root X1");
    expect(report.subject.display).toBe(report.issuer.display);
    expect(report.isCa).toBe(true);
    expect(report.keyUsage).toEqual(["keyCertSign", "cRLSign"]);
    expect(report.signatureAlgorithm).toBe("SHA-256 with RSA");
    expect(report.publicKeyAlgorithm).toBe("RSA");
    expect(report.publicKeyBits).toBe(4096);
    expect(report.notBefore?.toISOString()).toBe("2015-06-04T11:04:38.000Z");
    expect(report.notAfter?.toISOString()).toBe("2035-06-04T11:04:38.000Z");
    expect(report.serial.length).toBeGreaterThan(20);
    expect(report.subjectKeyId).toMatch(/^[0-9A-F:]+$/);
    expect(report.extensions.map(({ oid }) => oid)).toContain("2.5.29.19");
  });

  it("reads a generated chain with two certificates and leaf extensions", () => {
    const blocks = readPemBlocks(pem("sample-chain.pem"));
    expect(blocks.map(({ label }) => label)).toEqual(["CERTIFICATE", "CERTIFICATE"]);
    const leaf = parseCertificate(blocks[0]!.der);
    const root = parseCertificate(blocks[1]!.der);

    expect(leaf.subject.display).toBe("C=US, O=Anyfile Examples, OU=Sample Certificates, CN=www.example.anyfile.invalid");
    expect(leaf.issuer.display).toContain("Anyfile Sample Root CA");
    expect(leaf.isCa).toBe(false);
    expect(leaf.pathLength).toBeUndefined();
    expect(root.isCa).toBe(true);
    expect(root.pathLength).toBe(0);
    expect(leaf.keyUsage).toEqual(["digitalSignature", "keyEncipherment"]);
    expect(leaf.extendedKeyUsage).toEqual(["TLS server authentication", "TLS client authentication"]);
    expect(leaf.subjectAltNames).toEqual([
      { type: "DNS", value: "example.anyfile.invalid" },
      { type: "DNS", value: "www.example.anyfile.invalid" },
      { type: "IP", value: "203.0.113.7" },
      { type: "email", value: "ops@example.anyfile.invalid" },
    ]);
    expect(leaf.crlDistributionPoints).toEqual(["http://crl.example.anyfile.invalid/root.crl"]);
    expect(leaf.ocspUrls).toEqual(["http://ocsp.example.anyfile.invalid"]);
    expect(leaf.caIssuerUrls).toEqual(["http://ca.example.anyfile.invalid/root.crt"]);
    expect(leaf.policies).toEqual(["1.3.6.1.4.1.99999.1.1"]);
    expect(leaf.authorityKeyId).toBe(root.subjectKeyId);
    expect(leaf.notAfter!.getTime()).toBeGreaterThan(leaf.notBefore!.getTime());
  });

  it("reads DER input and elliptic curve keys", () => {
    const leaf = parseCertificate(read("sample-leaf.der"));
    expect(leaf.subject.display).toContain("www.example.anyfile.invalid");
    const ec = parseCertificate(firstPemCertificate("sample-ec.pem"));
    expect(ec.publicKeyAlgorithm).toBe("EC");
    expect(ec.publicKeyCurve).toBe("P-256");
  });

  it("rejects non-certificate DER and private keys", () => {
    expect(() => parseCertificate(read("truncated-cert.der"))).toThrow(Asn1Error);
    expect(readPemBlocks(pem("disguised-private-key.pem")).filter(({ label }) => label.endsWith("CERTIFICATE"))).toEqual([]);
    expect(() => parseCertificate(read("corrupt-cert.crt"))).toThrow(Asn1Error);
  });
});
