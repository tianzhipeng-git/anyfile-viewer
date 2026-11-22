import { selectMessages, type Locale } from "@anyfile/viewer-protocol";
import {
  createDataTable,
  createInspectorShell,
  createKeyValueList,
  createSection,
  createTabBar,
  el,
  formatBytes,
  viewerTheme,
  type KeyValueItem,
} from "@anyfile/viewer-ui";

import type { CertificateReport } from "./certificate";

export interface ViewCertificate {
  readonly report: CertificateReport;
  readonly fingerprints: { readonly sha256: string; readonly sha1: string };
}

export interface CertificateViewOptions {
  readonly certificates: readonly ViewCertificate[];
  readonly fileName: string;
  readonly fileSize: number;
  readonly locale: Locale;
}

export interface CertificateView {
  readonly root: HTMLElement;
  dispose(): void;
}

function copyFor(locale: Locale) {
  return selectMessages(locale, {
    en: {
      summary: "Certificate summary", subject: "Subject", issuer: "Issuer", serialNumber: "Serial number",
      notBefore: "Valid from", notAfter: "Valid to", version: "Version", signatureAlgorithm: "Signature algorithm",
      publicKey: "Public key", keyUsage: "Key usage", extendedKeyUsage: "Extended key usage",
      fingerprintSha256: "SHA-256 fingerprint", fingerprintSha1: "SHA-1 fingerprint", subjectAltNames: "Subject alternative names",
      extensions: "Extensions", registration: "Revocation and policies", crl: "CRL distribution points",
      ocsp: "OCSP responders", caIssuers: "CA issuers", policies: "Certificate policies",
      subjectKeyId: "Subject key identifier", authorityKeyId: "Authority key identifier",
      expired: "Expired", notYetValid: "Not yet valid", valid: "Currently valid",
      caBadge: "CA certificate", leafBadge: "End entity", critical: "critical", none: "None",
      certificates: "Certificates", fileSize: "File size", pathLength: "Path length constraint",
    },
    "zh-CN": {
      summary: "证书摘要", subject: "使用者", issuer: "颁发者", serialNumber: "序列号",
      notBefore: "生效时间", notAfter: "到期时间", version: "版本", signatureAlgorithm: "签名算法",
      publicKey: "公钥", keyUsage: "密钥用途", extendedKeyUsage: "扩展密钥用途",
      fingerprintSha256: "SHA-256 指纹", fingerprintSha1: "SHA-1 指纹", subjectAltNames: "使用者可选名称",
      extensions: "扩展", registration: "吊销与策略", crl: "CRL 分发点",
      ocsp: "OCSP 响应地址", caIssuers: "CA 证书地址", policies: "证书策略",
      subjectKeyId: "使用者密钥标识", authorityKeyId: "颁发者密钥标识",
      expired: "已过期", notYetValid: "尚未生效", valid: "当前有效",
      caBadge: "CA 证书", leafBadge: "终端实体", critical: "关键", none: "无",
      certificates: "证书", fileSize: "文件大小", pathLength: "路径长度限制",
    },
  });
}

type Copy = ReturnType<typeof copyFor>;

const extraStyles = `
  .anyfile-certificate-viewer .anyfile-inspector__section { max-width:1100px; margin-inline:auto; }
  .anyfile-certificate-viewer__list { margin:0; padding-inline-start:18px; font-size:13px; }
  .anyfile-certificate-viewer__list li { overflow-wrap:anywhere; }
  .anyfile-certificate-viewer__oid { display:block; color:${viewerTheme.muted}; font-family:${viewerTheme.fontMono}; font-size:11px; }
`;

function dateText(date: Date | undefined, locale: Locale) {
  if (!date) return undefined;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(date);
}

function validity(report: CertificateReport, copy: Copy): { text: string; tone: "success" | "danger" | "warning" } {
  const now = Date.now();
  if (report.notAfter && now > report.notAfter.getTime()) return { text: copy.expired, tone: "danger" };
  if (report.notBefore && now < report.notBefore.getTime()) return { text: copy.notYetValid, tone: "warning" };
  return { text: copy.valid, tone: "success" };
}

function stringList(items: readonly string[], copy: Copy, mono = false) {
  if (items.length === 0) return el("p", "anyfile-inspector__muted", copy.none);
  return el(
    "ul",
    "anyfile-certificate-viewer__list",
    ...items.map((item) => el("li", mono ? "anyfile-inspector__mono" : undefined, item)),
  );
}

export function createCertificateView(options: CertificateViewOptions): CertificateView {
  const { certificates, fileName, fileSize, locale } = options;
  const copy = copyFor(locale);
  const shell = createInspectorShell({
    className: "anyfile-certificate-viewer",
    title: fileName,
    extraStyles,
  });

  const renderSummary = (report: CertificateReport, entry: ViewCertificate) => {
    const status = validity(report, copy);
    shell.setTitle(
      report.subject.display || fileName,
      [
        report.isCa ? copy.caBadge : copy.leafBadge,
        certificates.length > 1 ? `${copy.certificates}: ${certificates.length}` : undefined,
        `${copy.fileSize}: ${formatBytes(fileSize, locale)}`,
      ].filter(Boolean).join(" · "),
    );
    shell.setBadges([{ text: status.text, tone: status.tone }]);

    const summaryItems: KeyValueItem[] = [
      { label: copy.subject, value: report.subject.display, hidden: !report.subject.display },
      { label: copy.issuer, value: report.issuer.display, hidden: !report.issuer.display },
      { label: copy.serialNumber, value: report.serial, mono: true, hidden: !report.serial },
      { label: copy.notBefore, value: dateText(report.notBefore, locale) ?? "", hidden: !report.notBefore },
      { label: copy.notAfter, value: dateText(report.notAfter, locale) ?? "", hidden: !report.notAfter },
      { label: copy.version, value: `v${report.version}` },
      { label: copy.signatureAlgorithm, value: report.signatureAlgorithm, hidden: !report.signatureAlgorithm },
      {
        label: copy.publicKey,
        value: [
          report.publicKeyAlgorithm || undefined,
          report.publicKeyBits ? `${report.publicKeyBits} bits` : undefined,
          report.publicKeyCurve,
        ].filter(Boolean).join(" · "),
        hidden: !report.publicKeyAlgorithm && !report.publicKeyBits && !report.publicKeyCurve,
      },
      { label: copy.pathLength, value: report.pathLength?.toString() ?? "", hidden: report.pathLength === undefined },
      { label: copy.subjectKeyId, value: report.subjectKeyId ?? "", mono: true, hidden: !report.subjectKeyId },
      { label: copy.authorityKeyId, value: report.authorityKeyId ?? "", mono: true, hidden: !report.authorityKeyId },
      { label: copy.keyUsage, value: report.keyUsage.join(", "), hidden: report.keyUsage.length === 0 },
      { label: copy.extendedKeyUsage, value: report.extendedKeyUsage.join(", "), hidden: report.extendedKeyUsage.length === 0 },
      { label: copy.fingerprintSha256, value: entry.fingerprints.sha256, mono: true, hidden: !entry.fingerprints.sha256 },
      { label: copy.fingerprintSha1, value: entry.fingerprints.sha1, mono: true, hidden: !entry.fingerprints.sha1 },
    ];

    const body: HTMLElement[] = [createSection(copy.summary, createKeyValueList(summaryItems))];

    if (report.subjectAltNames.length > 0) {
      const sanTable = createDataTable({
        columns: [{ label: "Type", width: "140px" }, { label: "Value" }],
        rows: report.subjectAltNames.map((name) => [name.type, name.value]),
        stickyHeader: false,
      });
      body.push(createSection(copy.subjectAltNames, sanTable.element));
    }

    const extTable = createDataTable({
      columns: [{ label: "Extension", width: "36%" }, { label: "Value" }],
      rows: report.extensions.map((extension) => {
        const nameCell = el(
          "div",
          undefined,
          el("span", undefined, extension.critical ? `${extension.name} (${copy.critical})` : extension.name),
          el("span", "anyfile-certificate-viewer__oid", extension.oid),
        );
        const valueCell = el("div");
        if (extension.summary) valueCell.append(el("div", "anyfile-inspector__mono", extension.summary));
        if (extension.items.length > 0) valueCell.append(stringList(extension.items, copy));
        if (!extension.summary && extension.items.length === 0) valueCell.textContent = copy.none;
        return [nameCell, valueCell];
      }),
      stickyHeader: false,
    });
    body.push(createSection(copy.extensions, extTable.element));

    if (
      report.crlDistributionPoints.length > 0 || report.ocspUrls.length > 0
      || report.caIssuerUrls.length > 0 || report.policies.length > 0
    ) {
      body.push(createSection(copy.registration, createKeyValueList([
        { label: copy.crl, value: stringList(report.crlDistributionPoints, copy, true), hidden: report.crlDistributionPoints.length === 0 },
        { label: copy.ocsp, value: stringList(report.ocspUrls, copy, true), hidden: report.ocspUrls.length === 0 },
        { label: copy.caIssuers, value: stringList(report.caIssuerUrls, copy, true), hidden: report.caIssuerUrls.length === 0 },
        { label: copy.policies, value: stringList(report.policies, copy, true), hidden: report.policies.length === 0 },
      ])));
    }
    return body;
  };

  const tabs = createTabBar({
    items: certificates.map((entry, index) => ({
      id: String(index),
      label: entry.report.subject.display || `${copy.certificates} ${index + 1}`,
    })),
    activeId: "0",
    className: "anyfile-certificate-viewer__tabs",
    buttonClassName: "anyfile-certificate-viewer__tab",
    onChange: (id) => {
      const entry = certificates[Number(id)]!;
      shell.viewport.replaceChildren(...renderSummary(entry.report, entry));
    },
  });
  tabs.element.hidden = certificates.length < 2;
  shell.toolbar.append(tabs.element);
  shell.onDispose(() => tabs.dispose());

  shell.viewport.replaceChildren(...renderSummary(certificates[0]!.report, certificates[0]!));
  return { root: shell.root, dispose: () => shell.dispose() };
}
