import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

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
      validUntil: "Valid until", expired: "Expired", notYetValid: "Not yet valid", valid: "Currently valid",
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
      validUntil: "有效期至", expired: "已过期", notYetValid: "尚未生效", valid: "当前有效",
      caBadge: "CA 证书", leafBadge: "终端实体", critical: "关键", none: "无",
      certificates: "证书", fileSize: "文件大小", pathLength: "路径长度限制",
    },
  });
}

type Copy = ReturnType<typeof copyFor>;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function styles() {
  const style = node("style");
  style.textContent = `
    .anyfile-certificate-viewer { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
    .anyfile-certificate-viewer * { box-sizing:border-box; }
    .anyfile-certificate-viewer__header { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; padding:14px 18px 10px; border-bottom:1px solid var(--viewer-border,#ddd); }
    .anyfile-certificate-viewer__title { min-width:0; flex:1; overflow:hidden; font-size:17px; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-certificate-viewer__badge { flex:none; border-radius:999px; padding:2px 10px; font-size:12px; font-weight:600; border:1px solid currentColor; }
    .anyfile-certificate-viewer__badge--valid { color:color-mix(in srgb, #22c55e 70%, var(--viewer-foreground,#111)); }
    .anyfile-certificate-viewer__badge--expired { color:color-mix(in srgb, #ef4444 70%, var(--viewer-foreground,#111)); }
    .anyfile-certificate-viewer__badge--pending { color:color-mix(in srgb, #f59e0b 65%, var(--viewer-foreground,#111)); }
    .anyfile-certificate-viewer__meta { flex:none; width:100%; font-size:12px; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); }
    .anyfile-certificate-viewer__tabs { flex:none; display:flex; flex-wrap:wrap; gap:6px; padding:10px 18px; border-bottom:1px solid var(--viewer-border,#ddd); }
    .anyfile-certificate-viewer__tab { max-width:100%; overflow:hidden; border:1px solid var(--viewer-border,#ccc); border-radius:6px; padding:4px 10px; background:transparent; color:inherit; font:inherit; font-size:12px; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
    .anyfile-certificate-viewer__tab[aria-pressed="true"] { border-color:var(--viewer-accent,#2563eb); background:color-mix(in srgb, var(--viewer-accent,#2563eb) 14%, transparent); font-weight:600; }
    .anyfile-certificate-viewer__viewport { min-height:0; flex:1; overflow:auto; padding:16px 18px 28px; }
    .anyfile-certificate-viewer__section { max-width:1100px; margin:0 auto 26px; }
    .anyfile-certificate-viewer__heading { margin:0 0 10px; font-size:13px; font-weight:600; letter-spacing:.02em; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); text-transform:uppercase; }
    .anyfile-certificate-viewer__details { display:grid; grid-template-columns:minmax(120px,200px) 1fr; gap:7px 18px; margin:0; font-size:13px; }
    .anyfile-certificate-viewer__details dt { color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); }
    .anyfile-certificate-viewer__details dd { margin:0; min-width:0; overflow-wrap:anywhere; }
    .anyfile-certificate-viewer__mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
    .anyfile-certificate-viewer__list { margin:0; padding-left:18px; font-size:13px; }
    .anyfile-certificate-viewer__list li { overflow-wrap:anywhere; }
    .anyfile-certificate-viewer__table { width:100%; border-collapse:collapse; font-size:12px; }
    .anyfile-certificate-viewer__table th, .anyfile-certificate-viewer__table td { border-bottom:1px solid var(--viewer-border,#ddd); padding:6px 8px; text-align:left; vertical-align:top; }
    .anyfile-certificate-viewer__table th { font-weight:600; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); }
    .anyfile-certificate-viewer__name { overflow-wrap:anywhere; }
    .anyfile-certificate-viewer__oid { display:block; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; }
  `;
  return style;
}

function dateText(date: Date | undefined, locale: Locale) {
  if (!date) return undefined;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(date);
}

function validity(report: CertificateReport, copy: Copy): { text: string; tone: string } {
  const now = Date.now();
  if (report.notAfter && now > report.notAfter.getTime()) return { text: copy.expired, tone: "expired" };
  if (report.notBefore && now < report.notBefore.getTime()) return { text: copy.notYetValid, tone: "pending" };
  return { text: copy.valid, tone: "valid" };
}

function section(title: string) {
  const wrapper = node("section", "anyfile-certificate-viewer__section");
  wrapper.append(node("h2", "anyfile-certificate-viewer__heading", title));
  return wrapper;
}

function stringList(items: readonly string[], copy: Copy, mono = false) {
  if (items.length === 0) return node("p", "anyfile-certificate-viewer__list", copy.none);
  const list = node("ul", "anyfile-certificate-viewer__list");
  for (const item of items) {
    const entry = node("li", mono ? "anyfile-certificate-viewer__mono" : undefined, item);
    list.append(entry);
  }
  return list;
}

export function createCertificateView(options: CertificateViewOptions): CertificateView {
  const { certificates, fileName, fileSize, locale } = options;
  const copy = copyFor(locale);
  const root = node("div", "anyfile-certificate-viewer");
  const header = node("div", "anyfile-certificate-viewer__header");
  const title = node("span", "anyfile-certificate-viewer__title");
  const badge = node("span", "anyfile-certificate-viewer__badge");
  const meta = node("span", "anyfile-certificate-viewer__meta");
  header.append(title, badge, meta);

  const tabs = node("div", "anyfile-certificate-viewer__tabs");
  tabs.hidden = certificates.length < 2;
  const viewport = node("div", "anyfile-certificate-viewer__viewport");
  const buttons: HTMLButtonElement[] = [];
  const listeners: Array<() => void> = [];

  const renderSummary = (report: CertificateReport, entry: ViewCertificate) => {
    const status = validity(report, copy);
    title.textContent = report.subject.display || fileName;
    badge.textContent = status.text;
    badge.className = `anyfile-certificate-viewer__badge anyfile-certificate-viewer__badge--${status.tone}`;
    meta.textContent = [
      report.isCa ? copy.caBadge : copy.leafBadge,
      certificates.length > 1 ? `${copy.certificates}: ${certificates.length}` : undefined,
      `${copy.fileSize}: ${fileSize.toLocaleString(locale)} B`,
    ].filter(Boolean).join(" · ");

    const summary = section(copy.summary);
    const list = node("dl", "anyfile-certificate-viewer__details");
    const add = (label: string, value: string | undefined, mono = false) => {
      if (!value) return;
      const detail = node("dd", mono ? "anyfile-certificate-viewer__mono" : undefined, value);
      list.append(node("dt", undefined, label), detail);
    };
    add(copy.subject, report.subject.display);
    add(copy.issuer, report.issuer.display);
    add(copy.serialNumber, report.serial, true);
    add(copy.notBefore, dateText(report.notBefore, locale));
    add(copy.notAfter, dateText(report.notAfter, locale));
    add(copy.version, `v${report.version}`);
    add(copy.signatureAlgorithm, report.signatureAlgorithm);
    add(copy.publicKey, [
      report.publicKeyAlgorithm || undefined,
      report.publicKeyBits ? `${report.publicKeyBits} bits` : undefined,
      report.publicKeyCurve,
    ].filter(Boolean).join(" · "));
    add(copy.pathLength, report.pathLength?.toString());
    add(copy.subjectKeyId, report.subjectKeyId, true);
    add(copy.authorityKeyId, report.authorityKeyId, true);
    add(copy.keyUsage, report.keyUsage.join(", "));
    add(copy.extendedKeyUsage, report.extendedKeyUsage.join(", "));
    add(copy.fingerprintSha256, entry.fingerprints.sha256, true);
    add(copy.fingerprintSha1, entry.fingerprints.sha1, true);
    summary.append(list);

    const body = [summary];
    if (report.subjectAltNames.length > 0) {
      const names = section(copy.subjectAltNames);
      const table = node("table", "anyfile-certificate-viewer__table");
      const head = node("thead"), headRow = node("tr");
      headRow.append(node("th", undefined, "Type"), node("th", undefined, "Value"));
      head.append(headRow);
      const rows = node("tbody");
      for (const name of report.subjectAltNames) {
        const row = node("tr");
        row.append(node("td", undefined, name.type), node("td", "anyfile-certificate-viewer__name", name.value));
        rows.append(row);
      }
      table.append(head, rows);
      names.append(table);
      body.push(names);
    }

    const extensions = section(copy.extensions);
    const extTable = node("table", "anyfile-certificate-viewer__table");
    const extHead = node("thead"), extHeadRow = node("tr");
    extHeadRow.append(node("th", undefined, "Extension"), node("th", undefined, "Value"));
    extHead.append(extHeadRow);
    const extRows = node("tbody");
    for (const extension of report.extensions) {
      const row = node("tr");
      const name = node("td", "anyfile-certificate-viewer__name");
      name.append(node("span", undefined, extension.critical ? `${extension.name} (${copy.critical})` : extension.name));
      name.append(node("span", "anyfile-certificate-viewer__oid", extension.oid));
      const value = node("td", "anyfile-certificate-viewer__name");
      if (extension.summary) value.append(node("div", "anyfile-certificate-viewer__mono", extension.summary));
      if (extension.items.length > 0) value.append(stringList(extension.items, copy));
      if (!extension.summary && extension.items.length === 0) value.textContent = copy.none;
      row.append(name, value);
      extRows.append(row);
    }
    extTable.append(extHead, extRows);
    extensions.append(extTable);
    body.push(extensions);

    if (report.crlDistributionPoints.length > 0 || report.ocspUrls.length > 0
      || report.caIssuerUrls.length > 0 || report.policies.length > 0) {
      const registration = section(copy.registration);
      const list = node("dl", "anyfile-certificate-viewer__details");
      const addList = (label: string, items: readonly string[]) => {
        if (items.length === 0) return;
        list.append(node("dt", undefined, label), node("dd", undefined, ""));
        const holder = list.lastElementChild as HTMLElement;
        holder.append(stringList(items, copy, true));
      };
      addList(copy.crl, report.crlDistributionPoints);
      addList(copy.ocsp, report.ocspUrls);
      addList(copy.caIssuers, report.caIssuerUrls);
      addList(copy.policies, report.policies);
      registration.append(list);
      body.push(registration);
    }
    return body;
  };

  const select = (index: number) => {
    const entry = certificates[index]!;
    buttons.forEach((button, position) => button.setAttribute("aria-pressed", position === index ? "true" : "false"));
    viewport.replaceChildren(...renderSummary(entry.report, entry));
  };

  certificates.forEach((entry, index) => {
    const button = node("button", "anyfile-certificate-viewer__tab", entry.report.subject.display || `${copy.certificates} ${index + 1}`);
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    const onClick = () => select(index);
    button.addEventListener("click", onClick);
    listeners.push(() => button.removeEventListener("click", onClick));
    buttons.push(button);
    tabs.append(button);
  });

  root.append(styles(), header, tabs, viewport);
  select(0);

  return {
    root,
    dispose() {
      for (const remove of listeners) remove();
      root.remove();
    },
  };
}
