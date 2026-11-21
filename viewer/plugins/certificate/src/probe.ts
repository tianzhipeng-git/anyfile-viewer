import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { Asn1Error, readNodeHeader } from "./asn1";

/** 16 KiB covers any ordinary certificate, including SCT and policy lists. */
const PROBE_BYTES = 16 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const CERTIFICATE_LABEL = /-----BEGIN (?:TRUSTED |X509 )?CERTIFICATE-----/;
const ANY_PEM_LABEL = /-----BEGIN ([A-Z0-9 ]+)-----/;

function latin1(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

export async function inspectCertificate({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("__anyfile_certificate_probe_v1__: aborted", "AbortError");
  if (file.size < 64 || file.size > MAX_FILE_BYTES) return 0;
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, Math.min(file.size, PROBE_BYTES)).arrayBuffer());
  } catch {
    if (signal.aborted) throw new DOMException("__anyfile_certificate_probe_v1__: aborted", "AbortError");
    return 0;
  }
  if (signal.aborted) throw new DOMException("__anyfile_certificate_probe_v1__: aborted", "AbortError");

  const text = latin1(head);
  if (text.includes("-----BEGIN ")) {
    if (!CERTIFICATE_LABEL.test(text)) return 0;
    const first = ANY_PEM_LABEL.exec(text);
    return first && CERTIFICATE_LABEL.test(`-----BEGIN ${first[1]}-----`) ? 4 : 0;
  }

  if (head[0] !== 0x30) return 0;
  try {
    const outer = readNodeHeader(head, 0, head.byteLength);
    if (outer.end !== file.size) return 0;
    const tbs = readNodeHeader(head, outer.contentStart, head.byteLength);
    if (tbs.tag !== 0x30 || tbs.end > outer.end) return 0;
    const signatureAlgorithm = readNodeHeader(head, tbs.end, head.byteLength);
    return signatureAlgorithm.tag === 0x30 && signatureAlgorithm.end <= outer.end ? 4 : 0;
  } catch (error) {
    if (!(error instanceof Asn1Error)) throw error;
    return 0;
  }
}
