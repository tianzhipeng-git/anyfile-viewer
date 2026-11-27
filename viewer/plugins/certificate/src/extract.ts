import {
  AgentError,
  abortError,
  isViewerAbortError,
  paginateLines,
  readBlob,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

import {
  MAX_CERTIFICATE_FILE_BYTES,
  decodeCertificates,
  describePemBlock,
  fingerprints,
  readPemBlocks,
  type CertificateReport,
  type KeyBlockReport,
} from "./certificate";

const PLUGIN_ID = "x509-certificate";

interface LoadedFile {
  readonly encoding: "PEM" | "DER";
  readonly certificates: readonly CertificateReport[];
  readonly otherBlocks: readonly KeyBlockReport[];
}

async function load(context: ExtractContext): Promise<LoadedFile> {
  if (context.signal.aborted) throw abortError();
  if (context.file.size > MAX_CERTIFICATE_FILE_BYTES) {
    throw new AgentError("resource-limit", "The file is larger than the 8 MiB certificate limit.", { pluginId: PLUGIN_ID });
  }
  try {
    const bytes = await readBlob(context.file, context.signal);
    const certificates = decodeCertificates(bytes);
    if (bytes[0] === 0x30) return { encoding: "DER", certificates, otherBlocks: [] };
    const otherBlocks = readPemBlocks(new TextDecoder("utf-8").decode(bytes))
      .filter(({ label }) => !label.endsWith("CERTIFICATE"))
      .map(describePemBlock);
    return { encoding: "PEM", certificates, otherBlocks };
  } catch (error) {
    if (isViewerAbortError(error)) throw error;
    throw new AgentError("invalid-file", "The file is damaged or does not contain an X.509 certificate.", {
      pluginId: PLUGIN_ID,
      cause: error,
    });
  }
}

function keyText(report: { readonly algorithm?: string; readonly bits?: number; readonly curve?: string }): string {
  const parts = [report.algorithm, report.curve, report.bits ? `${report.bits} bits` : undefined].filter(Boolean);
  return parts.length ? parts.join(" ") : "unknown algorithm";
}

function validity(report: CertificateReport, now: number): string {
  if (report.notBefore && now < report.notBefore.getTime()) return "not yet valid";
  if (report.notAfter && now > report.notAfter.getTime()) return "expired";
  return "currently valid";
}

async function certificateLines(report: CertificateReport, index: number, signal: AbortSignal): Promise<string[]> {
  const prints = await fingerprints(report.der, signal);
  const list = (name: string, items: readonly string[]) => (items.length ? [`- **${name}**: ${items.join("; ")}`] : []);
  const field = (name: string, value: string | undefined) => (value ? [`- **${name}**: ${value}`] : []);
  return [
    `## Certificate ${index + 1}: ${report.subject.display || "(empty subject)"}`,
    "",
    ...field("Version", `v${report.version}`),
    ...field("Serial", report.serial),
    ...field("Subject", report.subject.display),
    ...field("Issuer", report.issuer.display),
    ...field("Not before", report.notBefore?.toISOString()),
    ...field("Not after", report.notAfter?.toISOString()),
    ...field("Validity", validity(report, Date.now())),
    ...field("Signature algorithm", report.signatureAlgorithm),
    ...field("Public key", keyText({ algorithm: report.publicKeyAlgorithm, bits: report.publicKeyBits, curve: report.publicKeyCurve })),
    ...field("CA", report.isCa ? `yes${report.pathLength !== undefined ? ` (pathLen ${report.pathLength})` : ""}` : "no"),
    ...list("Key usage", report.keyUsage),
    ...list("Extended key usage", report.extendedKeyUsage),
    ...list("Subject alternative names", report.subjectAltNames.map(({ type, value }) => `${type}: ${value}`)),
    ...field("Subject key ID", report.subjectKeyId),
    ...field("Authority key ID", report.authorityKeyId),
    ...list("Policies", report.policies),
    ...list("CRL distribution points", report.crlDistributionPoints),
    ...list("OCSP", report.ocspUrls),
    ...list("CA issuers", report.caIssuerUrls),
    ...field("SHA-256 fingerprint", prints.sha256),
    ...field("SHA-1 fingerprint", prints.sha1),
    ...(report.extensions.length ? ["- **Extensions**:"] : []),
    ...report.extensions.map((extension) => {
      const detail = [extension.summary, ...extension.items].filter(Boolean).join("; ");
      return `  - ${extension.name} (${extension.oid})${extension.critical ? " [critical]" : ""}${detail ? `: ${detail}` : ""}`;
    }),
    "",
  ];
}

function keyLines(blocks: readonly KeyBlockReport[]): string[] {
  return [
    "## Other PEM blocks",
    "",
    ...blocks.map((block) => {
      const kind = block.kind === "other" ? "not decoded" : `${block.kind.replace("-", " ")}, ${keyText(block)}`;
      return `- \`${block.label}\`: ${kind}${block.encrypted ? ", encrypted" : ""}${block.kind === "private-key" ? " (key material not shown)" : ""}`;
    }),
    "",
  ];
}

const certificateExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const { encoding, certificates, otherBlocks } = await load(context);
    const privateKeys = otherBlocks.filter(({ kind }) => kind === "private-key");
    const targets: TargetEntry[] = [
      { id: "all", title: "All certificates", kind: "certificates", size: certificates.length },
      ...certificates.map((report, index) => ({
        id: `cert:${index + 1}`,
        title: report.subject.display || `Certificate ${index + 1}`,
        kind: report.isCa ? "ca-certificate" : "certificate",
      })),
    ];
    if (otherBlocks.length) targets.push({ id: "keys", title: "Other PEM blocks", kind: "keys", size: otherBlocks.length });
    const leaf = certificates[0]!;
    return {
      metadata: {
        encoding,
        certificateCount: certificates.length,
        blockKinds: [...new Set([...certificates.map(() => "CERTIFICATE"), ...otherBlocks.map(({ label }) => label)])],
        privateKeyPresent: privateKeys.length > 0,
        ...(privateKeys.length ? { privateKeys: privateKeys.map((block) => `${block.label}: ${keyText(block)}`) } : {}),
        subject: leaf.subject.display,
        issuer: leaf.issuer.display,
        ...(leaf.notAfter ? { notAfter: leaf.notAfter.toISOString() } : {}),
        sizeBytes: context.source.size,
      },
      targets,
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const loaded = await load(context);
    const target = params.target ?? "all";
    let lines: string[];
    if (target === "all") {
      lines = [];
      for (const [index, report] of loaded.certificates.entries()) {
        lines.push(...(await certificateLines(report, index, context.signal)));
      }
      if (loaded.otherBlocks.length) lines.push(...keyLines(loaded.otherBlocks));
    } else if (target === "keys" && loaded.otherBlocks.length) {
      lines = keyLines(loaded.otherBlocks);
    } else {
      const index = /^cert:(\d+)$/.exec(target) ? Number(target.slice(5)) - 1 : -1;
      const report = loaded.certificates[index];
      if (!report) throw new AgentError("target-not-found", `Certificate target not found: "${target}".`, { pluginId: PLUGIN_ID });
      lines = await certificateLines(report, index, context.signal);
    }
    while (lines.at(-1) === "") lines.pop();
    const needle = params.filter?.trim().toLowerCase();
    if (needle) lines = lines.filter((line) => line.toLowerCase().includes(needle));
    const page = paginateLines(lines, params.cursor, params.maxBytes, PLUGIN_ID);
    return {
      content: page.content,
      contentType: "markdown",
      truncated: page.truncated,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      ...(needle ? { filterApplied: true } : {}),
    };
  },
};

export default certificateExtractor;
