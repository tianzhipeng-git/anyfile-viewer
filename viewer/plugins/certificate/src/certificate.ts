import {
  Asn1Error,
  child,
  childNodes,
  content,
  createBudget,
  hex,
  readBitString,
  readBoolean,
  readNode,
  readOid,
  readString,
  readTime,
  unsignedBytes,
  type DerBudget,
  type DerNode,
} from "./asn1";

const MAX_PEM_BLOCKS = 40;
const NAME_ATTRIBUTES: Readonly<Record<string, string>> = {
  "2.5.4.3": "CN", "2.5.4.4": "SN", "2.5.4.5": "serialNumber", "2.5.4.6": "C", "2.5.4.7": "L",
  "2.5.4.8": "ST", "2.5.4.9": "street", "2.5.4.10": "O", "2.5.4.11": "OU", "2.5.4.12": "title",
  "2.5.4.17": "postalCode", "2.5.4.42": "givenName", "2.5.4.43": "initials", "2.5.4.65": "pseudonym",
  "2.5.4.97": "organizationIdentifier", "0.9.2342.19200300.100.1.1": "UID",
  "0.9.2342.19200300.100.1.25": "DC", "1.2.840.113549.1.9.1": "emailAddress",
  "1.3.6.1.4.1.311.60.2.1.3": "jurisdictionC",
};
const SIGNATURE_ALGORITHMS: Readonly<Record<string, string>> = {
  "1.2.840.113549.1.1.2": "MD2 with RSA", "1.2.840.113549.1.1.4": "MD5 with RSA",
  "1.2.840.113549.1.1.5": "SHA-1 with RSA", "1.2.840.113549.1.1.11": "SHA-256 with RSA",
  "1.2.840.113549.1.1.12": "SHA-384 with RSA", "1.2.840.113549.1.1.13": "SHA-512 with RSA",
  "1.2.840.113549.1.1.10": "RSASSA-PSS", "1.2.840.10045.4.1": "ECDSA with SHA-1",
  "1.2.840.10045.4.3.2": "ECDSA with SHA-256", "1.2.840.10045.4.3.3": "ECDSA with SHA-384",
  "1.2.840.10045.4.3.4": "ECDSA with SHA-512", "1.3.101.112": "Ed25519", "1.3.101.113": "Ed448",
  "1.3.101.114": "Ed448", "2.16.840.1.101.3.4.3.2": "DSA with SHA-256",
};
const PUBLIC_KEY_ALGORITHMS: Readonly<Record<string, string>> = {
  "1.2.840.113549.1.1.1": "RSA", "1.2.840.113549.1.1.10": "RSASSA-PSS",
  "1.2.840.10045.2.1": "EC", "1.2.840.10040.4.1": "DSA", "1.3.101.112": "Ed25519", "1.3.101.113": "Ed448",
};
const CURVE_NAMES: Readonly<Record<string, string>> = {
  "1.2.840.10045.3.1.7": "P-256", "1.3.132.0.34": "P-384", "1.3.132.0.35": "P-521",
  "1.3.132.0.10": "secp256k1", "1.3.132.0.33": "P-224",
};
const EXTENSION_NAMES: Readonly<Record<string, string>> = {
  "2.5.29.14": "Subject Key Identifier", "2.5.29.15": "Key Usage", "2.5.29.16": "Private Key Usage Period",
  "2.5.29.17": "Subject Alternative Name", "2.5.29.18": "Issuer Alternative Name",
  "2.5.29.19": "Basic Constraints", "2.5.29.30": "Name Constraints", "2.5.29.31": "CRL Distribution Points",
  "2.5.29.32": "Certificate Policies", "2.5.29.35": "Authority Key Identifier", "2.5.29.36": "Policy Constraints",
  "2.5.29.37": "Extended Key Usage", "2.5.29.46": "Freshest CRL", "2.5.29.54": "Inhibit Any Policy",
  "1.3.6.1.5.5.7.1.1": "Authority Information Access", "1.3.6.1.5.5.7.1.11": "Subject Information Access",
  "1.3.6.1.4.1.11129.2.4.2": "Signed Certificate Timestamp List",
};
const EXTENDED_KEY_USAGE: Readonly<Record<string, string>> = {
  "1.3.6.1.5.5.7.3.1": "TLS server authentication", "1.3.6.1.5.5.7.3.2": "TLS client authentication",
  "1.3.6.1.5.5.7.3.3": "Code signing", "1.3.6.1.5.5.7.3.4": "Email protection",
  "1.3.6.1.5.5.7.3.8": "Time stamping", "1.3.6.1.5.5.7.3.9": "OCSP signing",
  "2.5.29.37.0": "Any extended key usage",
};
const KEY_USAGE = [
  "digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment",
  "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly", "decipherOnly",
] as const;
const SAN_LABELS: Readonly<Record<number, string>> = {
  0xa0: "otherName", 0x81: "email", 0x82: "DNS", 0xa3: "x400Address", 0xa4: "directoryName",
  0xa5: "ediPartyName", 0x86: "URI", 0x87: "IP", 0x88: "registeredID",
};
const AIA_METHODS: Readonly<Record<string, "ocsp" | "caIssuers">> = {
  "1.3.6.1.5.5.7.48.1": "ocsp", "1.3.6.1.5.5.7.48.2": "caIssuers",
};

export interface NameAttribute { readonly oid: string; readonly label: string; readonly value: string }
export interface DistinguishedName { readonly display: string; readonly attributes: readonly NameAttribute[] }
export interface SubjectAltName { readonly type: string; readonly value: string }
export interface ExtensionReport {
  readonly oid: string;
  readonly name: string;
  readonly critical: boolean;
  readonly summary: string;
  readonly items: readonly string[];
}

export interface CertificateReport {
  readonly version: number;
  readonly serial: string;
  readonly subject: DistinguishedName;
  readonly issuer: DistinguishedName;
  readonly notBefore?: Date;
  readonly notAfter?: Date;
  readonly signatureAlgorithm: string;
  readonly publicKeyAlgorithm: string;
  readonly publicKeyBits?: number;
  readonly publicKeyCurve?: string;
  readonly isCa: boolean;
  readonly pathLength?: number;
  readonly keyUsage: readonly string[];
  readonly extendedKeyUsage: readonly string[];
  readonly subjectAltNames: readonly SubjectAltName[];
  readonly subjectKeyId?: string;
  readonly authorityKeyId?: string;
  readonly policies: readonly string[];
  readonly crlDistributionPoints: readonly string[];
  readonly ocspUrls: readonly string[];
  readonly caIssuerUrls: readonly string[];
  readonly extensions: readonly ExtensionReport[];
  readonly der: Uint8Array;
}

export interface PemBlock { readonly label: string; readonly der: Uint8Array }

export function readPemBlocks(text: string): PemBlock[] {
  const blocks: PemBlock[] = [];
  const pattern = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  for (const match of text.matchAll(pattern)) {
    if (blocks.length >= MAX_PEM_BLOCKS) break;
    const body = match[2]!.replace(/[^A-Za-z0-9+/=]/g, "");
    let binary: string;
    try {
      binary = atob(body);
    } catch {
      continue;
    }
    const der = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (der.byteLength > 0) blocks.push({ label: match[1]!, der });
  }
  return blocks;
}

function oidName(oid: string, map: Readonly<Record<string, string>>): string {
  return map[oid] ?? oid;
}

function readAlgorithm(bytes: Uint8Array, node: DerNode | undefined, budget: DerBudget): { oid: string; params?: DerNode } {
  const oidNode = node ? child(bytes, node, 0, budget) : undefined;
  const oid = oidNode ? readOid(bytes, oidNode) : "";
  return { oid, params: node ? child(bytes, node, 1, budget) : undefined };
}

function parseName(bytes: Uint8Array, node: DerNode, budget: DerBudget): DistinguishedName {
  const attributes: NameAttribute[] = [];
  for (const rdn of childNodes(bytes, node, budget)) {
    for (const attribute of childNodes(bytes, rdn, budget)) {
      const oidNode = child(bytes, attribute, 0, budget);
      const valueNode = child(bytes, attribute, 1, budget);
      if (!oidNode || !valueNode) continue;
      const oid = readOid(bytes, oidNode);
      attributes.push({ oid, label: NAME_ATTRIBUTES[oid] ?? oid, value: readString(bytes, valueNode).trim() });
      if (attributes.length > 64) return { display: "", attributes };
    }
  }
  return { display: attributes.map(({ label, value }) => `${label}=${value}`).join(", "), attributes };
}

function describeIp(raw: Uint8Array): string {
  if (raw.byteLength === 4) return Array.from(raw).join(".");
  if (raw.byteLength === 16) {
    const groups: string[] = [];
    for (let i = 0; i < 16; i += 2) groups.push(((raw[i]! << 8) | raw[i + 1]!).toString(16));
    return groups.join(":");
  }
  return hex(raw);
}

function parseGeneralNames(bytes: Uint8Array, node: DerNode, budget: DerBudget): SubjectAltName[] {
  const names: SubjectAltName[] = [];
  for (const entry of childNodes(bytes, node, budget)) {
    const type = SAN_LABELS[entry.tag] ?? `[${entry.tag & 0x1f}]`;
    if (entry.tag === 0x87) names.push({ type, value: describeIp(content(bytes, entry)) });
    else if (entry.constructed) {
      const inner = childNodes(bytes, entry, budget);
      const text = inner.map((item) => readString(bytes, item)).join(", ");
      names.push({ type, value: text || hex(content(bytes, entry)) });
    } else names.push({ type, value: readString(bytes, entry) });
    if (names.length > 128) break;
  }
  return names;
}

function readBitFlags(bytes: Uint8Array, node: DerNode): string[] {
  const bits = readBitString(bytes, node);
  const flags: string[] = [];
  KEY_USAGE.forEach((label, index) => {
    if (index < bits.length * 8 && (bits[Math.floor(index / 8)]! & (0x80 >> (index % 8))) !== 0) flags.push(label);
  });
  return flags;
}

function collectUris(bytes: Uint8Array, node: DerNode, budget: DerBudget, out: string[]): void {
  if (out.length >= 16) return;
  if (node.tag === 0x86) {
    out.push(readString(bytes, node));
    return;
  }
  if (!node.constructed) return;
  for (const item of childNodes(bytes, node, budget)) collectUris(bytes, item, budget, out);
}

function decodeExtension(bytes: Uint8Array, value: Uint8Array, oid: string, budget: DerBudget): { summary: string; items: string[] } {
  if (value.byteLength === 0) return { summary: "", items: [] };
  const root = readNode(value, 0, value.byteLength, budget);
  if (oid === "2.5.29.19") {
    let isCa = false;
    const items: string[] = [];
    for (const item of childNodes(value, root, budget)) {
      if (item.tag === 0x01) isCa = readBoolean(value, item);
      else if (item.tag === 0x02) items.push(`pathLenConstraint=${Number.parseInt(hex(unsignedBytes(value, item)), 16)}`);
    }
    return { summary: isCa ? "CA certificate" : "End-entity certificate", items };
  }
  if (oid === "2.5.29.15") return { summary: "", items: readBitFlags(value, root) };
  if (oid === "2.5.29.37") {
    const items = childNodes(value, root, budget)
      .map((item) => oidName(readOid(value, item), EXTENDED_KEY_USAGE))
      .slice(0, 64);
    return { summary: "", items };
  }
  if (oid === "2.5.29.17") {
    const items = parseGeneralNames(value, root, budget).map(({ type, value: text }) => `${type}: ${text}`);
    return { summary: "", items };
  }
  if (oid === "2.5.29.14") return { summary: hex(content(value, root)), items: [] };
  if (oid === "2.5.29.35") {
    const keyId = childNodes(value, root, budget).find((item) => item.tag === 0x80);
    return { summary: keyId ? hex(content(value, keyId)) : "", items: [] };
  }
  if (oid === "2.5.29.31" || oid === "2.5.29.46") {
    const uris: string[] = [];
    collectUris(value, root, budget, uris);
    return { summary: "", items: uris };
  }
  if (oid === "1.3.6.1.5.5.7.1.1") {
    const items = childNodes(value, root, budget).flatMap((entry) => {
      const method = child(value, entry, 0, budget);
      const location = child(value, entry, 1, budget);
      if (!method || !location) return [];
      const name = AIA_METHODS[readOid(value, method)];
      return name && location.tag === 0x86 ? [`${name}: ${readString(value, location)}`] : [];
    });
    return { summary: "", items };
  }
  if (oid === "2.5.29.32") {
    const items = childNodes(value, root, budget).flatMap((entry) => {
      const policy = child(value, entry, 0, budget);
      return policy ? [readOid(value, policy)] : [];
    });
    return { summary: "", items };
  }
  return { summary: `${value.byteLength} bytes`, items: [] };
}

function publicKeyInfo(
  bytes: Uint8Array,
  node: DerNode | undefined,
  budget: DerBudget,
): { algorithm: string; bits?: number; curve?: string } {
  if (!node) return { algorithm: "" };
  const algorithmNode = child(bytes, node, 0, budget);
  const keyNode = child(bytes, node, 1, budget);
  const { oid, params } = readAlgorithm(bytes, algorithmNode, budget);
  const algorithm = oidName(oid, PUBLIC_KEY_ALGORITHMS);
  const curve = params && params.tag === 0x06 ? CURVE_NAMES[readOid(bytes, params)] : undefined;
  if (!keyNode) return { algorithm, curve };
  const bits = readBitString(bytes, keyNode);
  if (oid === "1.2.840.113549.1.1.1" && bits.byteLength > 0) {
    try {
      const sequence = readNode(bits, 0, bits.byteLength, budget);
      const modulus = child(bits, sequence, 0, budget);
      if (modulus) {
        const value = unsignedBytes(bits, modulus);
        const leading = value[0]!.toString(2).length;
        return { algorithm, bits: value.byteLength * 8 - (8 - leading) };
      }
    } catch (error) {
      if (!(error instanceof Asn1Error)) throw error;
    }
  }
  return { algorithm, curve, bits: curve ? undefined : bits.byteLength * 8 };
}

function parseExtensions(
  bytes: Uint8Array,
  node: DerNode,
  budget: DerBudget,
): ExtensionReport[] {
  const wrapper = child(bytes, node, 0, budget);
  if (!wrapper) return [];
  const reports: ExtensionReport[] = [];
  for (const entry of childNodes(bytes, wrapper, budget)) {
    const oidNode = child(bytes, entry, 0, budget);
    if (!oidNode) continue;
    const oid = readOid(bytes, oidNode);
    let critical = false;
    let valueNode = child(bytes, entry, 1, budget);
    if (valueNode?.tag === 0x01) {
      critical = readBoolean(bytes, valueNode);
      valueNode = child(bytes, entry, 2, budget);
    }
    if (!valueNode) continue;
    const value = content(bytes, valueNode);
    let decoded: { summary: string; items: string[] } = { summary: "", items: [] };
    try {
      decoded = decodeExtension(bytes, value, oid, budget);
    } catch (error) {
      if (!(error instanceof Asn1Error)) throw error;
    }
    reports.push({ oid, name: EXTENSION_NAMES[oid] ?? "Unknown extension", critical, ...decoded });
    if (reports.length >= 64) break;
  }
  return reports;
}

export function parseCertificate(der: Uint8Array): CertificateReport {
  const budget = createBudget();
  const root = readNode(der, 0, der.byteLength, budget);
  if (root.tag !== 0x30 || root.end !== der.byteLength) throw new Asn1Error("Certificate is not a single DER SEQUENCE.");
  const tbs = child(der, root, 0, budget);
  const outerSignature = child(der, root, 1, budget);
  const signatureValue = child(der, root, 2, budget);
  if (!tbs || tbs.tag !== 0x30 || !outerSignature || signatureValue?.tag !== 0x03) {
    throw new Asn1Error("Not a signed X.509 certificate.");
  }

  let index = 0;
  let version = 0;
  const first = child(der, tbs, index, budget);
  if (first?.tag === 0xa0) {
    const versionNode = child(der, first, 0, budget);
    if (versionNode?.tag === 0x02) version = Number.parseInt(hex(unsignedBytes(der, versionNode), ""), 16);
    index += 1;
  }
  const serialNode = child(der, tbs, index++, budget);
  const signatureNode = child(der, tbs, index++, budget);
  const issuerNode = child(der, tbs, index++, budget);
  const validityNode = child(der, tbs, index++, budget);
  const subjectNode = child(der, tbs, index++, budget);
  const spkiNode = child(der, tbs, index++, budget);
  if (!serialNode || !issuerNode || !validityNode || !subjectNode) throw new Asn1Error("TBSCertificate is missing required fields.");

  const validity = childNodes(der, validityNode, budget);
  const innerSignature = readAlgorithm(der, signatureNode, budget);
  const outer = readAlgorithm(der, outerSignature, budget);
  const signatureOid = innerSignature.oid || outer.oid;
  const publicKey = publicKeyInfo(der, spkiNode, budget);

  let extensionNode: DerNode | undefined;
  for (let position = index; position < index + 3; position += 1) {
    const candidate = child(der, tbs, position, budget);
    if (candidate?.tag === 0xa3) extensionNode = candidate;
  }
  const extensions = extensionNode ? parseExtensions(der, extensionNode, budget) : [];
  const basic = extensions.find(({ oid }) => oid === "2.5.29.19");
  const keyUsage = extensions.find(({ oid }) => oid === "2.5.29.15")?.items ?? [];
  const extendedKeyUsage = extensions.find(({ oid }) => oid === "2.5.29.37")?.items ?? [];
  const san = extensions.find(({ oid }) => oid === "2.5.29.17")?.items ?? [];
  const policies = extensions.find(({ oid }) => oid === "2.5.29.32")?.items ?? [];
  const aia = extensions.find(({ oid }) => oid === "1.3.6.1.5.5.7.1.1")?.items ?? [];
  const pathLength = basic?.items.find((item) => item.startsWith("pathLenConstraint="));

  return {
    version: version + 1,
    serial: hex(unsignedBytes(der, serialNode)),
    subject: parseName(der, subjectNode, budget),
    issuer: parseName(der, issuerNode, budget),
    notBefore: validity[0] ? readTime(der, validity[0]) : undefined,
    notAfter: validity[1] ? readTime(der, validity[1]) : undefined,
    signatureAlgorithm: oidName(signatureOid, SIGNATURE_ALGORITHMS),
    publicKeyAlgorithm: publicKey.algorithm,
    publicKeyBits: publicKey.bits,
    publicKeyCurve: publicKey.curve,
    isCa: basic?.summary === "CA certificate",
    pathLength: pathLength ? Number(pathLength.split("=")[1]) : undefined,
    keyUsage,
    extendedKeyUsage,
    subjectAltNames: san.map((item) => {
      const split = item.indexOf(": ");
      return split < 0 ? { type: "name", value: item } : { type: item.slice(0, split), value: item.slice(split + 2) };
    }),
    subjectKeyId: extensions.find(({ oid }) => oid === "2.5.29.14")?.summary || undefined,
    authorityKeyId: extensions.find(({ oid }) => oid === "2.5.29.35")?.summary || undefined,
    policies,
    crlDistributionPoints: extensions.find(({ oid }) => oid === "2.5.29.31")?.items ?? [],
    ocspUrls: aia.filter((item) => item.startsWith("ocsp: ")).map((item) => item.slice(6)),
    caIssuerUrls: aia.filter((item) => item.startsWith("caIssuers: ")).map((item) => item.slice(11)),
    extensions,
    der,
  };
}

export async function fingerprints(der: Uint8Array, signal: AbortSignal): Promise<{ sha256: string; sha1: string }> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { sha256: "", sha1: "" };
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  const data = new Uint8Array(der);
  const [sha256, sha1] = await Promise.all([
    subtle.digest("SHA-256", data),
    subtle.digest("SHA-1", data),
  ]);
  return { sha256: hex(new Uint8Array(sha256)), sha1: hex(new Uint8Array(sha1)) };
}
