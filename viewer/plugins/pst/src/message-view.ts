import type { Locale } from "@anyfile/viewer-protocol";
import { createKeyValueList, createNotice, createTabBar, el, formatBytes, type KeyValueItem } from "@anyfile/viewer-ui";

import type { PstCopy } from "./copy";
import { sanitizeEmailHtml } from "./html";
import type { AttachmentInfo, MessageDetail, PstArchive, Recipient } from "./messaging";
import { decompressRtf, rtfToBody } from "./rtf";
import { PST_LIMITS } from "./types";

type BodyTab = "html" | "text" | "headers";

export interface MessageBody {
  readonly html: string;
  readonly text: string;
}

/** Picks the richest available body: HTML, RTF (encapsulated HTML or text), then plain text. */
export function resolveBody(detail: MessageDetail): MessageBody {
  let { html, text } = detail;
  if (!html && detail.rtf) {
    try {
      const rtf = rtfToBody(decompressRtf(detail.rtf));
      if (rtf.kind === "html") html = rtf.content;
      else if (!text) text = rtf.content;
    } catch {
      // A damaged RTF body falls back to whatever plain text exists.
    }
  }
  return { html, text };
}

function recipientsText(recipients: readonly Recipient[], kind: Recipient["kind"], fallback: string) {
  const list = recipients.filter((recipient) => recipient.kind === kind);
  if (list.length === 0) return fallback;
  return list.map(({ name, address }) => (name && address && name !== address ? `${name} <${address}>` : name || address)).join("; ");
}

function isInlineImage(attachment: AttachmentInfo) {
  return Boolean(attachment.contentId) && (/^image\//i.test(attachment.mime) || /\.(?:png|jpe?g|gif|webp|bmp)$/i.test(attachment.name));
}

/**
 * Renders one message. Returns a disposer that revokes every Object URL it created;
 * `isCurrent` lets late async work bail out after the selection changed.
 */
export async function renderMessage(
  target: HTMLElement,
  archive: PstArchive,
  detail: MessageDetail,
  copy: PstCopy,
  locale: Locale,
  isCurrent: () => boolean,
): Promise<() => void> {
  const urls: string[] = [];
  const cleanups: Array<() => void> = [() => urls.forEach((url) => URL.revokeObjectURL(url))];
  const dispose = () => cleanups.splice(0).forEach((cleanup) => cleanup());

  const header: KeyValueItem[] = [
    { label: copy.from, value: detail.fromAddress && detail.fromAddress !== detail.from ? `${detail.from} <${detail.fromAddress}>` : detail.from || detail.fromAddress, hidden: !detail.from && !detail.fromAddress },
    { label: copy.to, value: recipientsText(detail.recipients, "to", detail.displayTo) },
    { label: copy.cc, value: recipientsText(detail.recipients, "cc", detail.displayCc) },
    { label: copy.bcc, value: recipientsText(detail.recipients, "bcc", "") },
    { label: copy.date, value: detail.date ? detail.date.toLocaleString(locale) : "" },
    { label: copy.type, value: detail.messageClass, mono: true },
  ].filter((item) => item.value);

  const attachmentList = el("div", "anyfile-pst__attachments");
  for (const attachment of detail.attachments) {
    const label = `${attachment.name || "attachment"}${attachment.size ? ` · ${formatBytes(attachment.size, locale)}` : ""}`;
    if (attachment.embeddedMessage) {
      attachmentList.append(el("span", "anyfile-inspector__badge", `${label} (${copy.embedded})`));
      continue;
    }
    const button = el("button", { className: "anyfile-inspector__btn", attrs: { type: "button" }, dataset: { pstAttachment: String(attachment.nid) }, title: copy.download }, `⤓ ${label}`);
    const onClick = async () => {
      button.disabled = true;
      try {
        const data = await archive.attachmentData(detail.nid, attachment.nid);
        if (!isCurrent()) return;
        const url = URL.createObjectURL(new Blob([data as BlobPart], { type: attachment.mime || "application/octet-stream" }));
        urls.push(url);
        const link = el("a", { attrs: { href: url, download: attachment.name || "attachment" } });
        link.click();
      } catch {
        if (isCurrent()) button.after(createNotice(copy.itemError, "warning"));
      } finally {
        button.disabled = false;
      }
    };
    button.addEventListener("click", onClick);
    cleanups.push(() => button.removeEventListener("click", onClick));
    attachmentList.append(button);
  }

  const body = resolveBody(detail);
  const tabs: { id: BodyTab; label: string }[] = [];
  if (body.html) tabs.push({ id: "html", label: copy.formatted });
  if (body.text) tabs.push({ id: "text", label: copy.plain });
  if (detail.headers) tabs.push({ id: "headers", label: copy.headers });

  const bodyHost = el("div", "anyfile-pst__body");
  const cidUrls = new Map<string, string>();
  if (body.html) {
    let budget = PST_LIMITS.maxInlineImageBytes;
    for (const attachment of detail.attachments.filter(isInlineImage)) {
      if ((attachment.size ?? 0) > budget) continue;
      try {
        const data = await archive.attachmentData(detail.nid, attachment.nid, budget);
        budget -= data.length;
        const url = URL.createObjectURL(new Blob([data as BlobPart], { type: attachment.mime || "image/png" }));
        urls.push(url);
        cidUrls.set(attachment.contentId.replace(/^<|>$/g, "").toLowerCase(), url);
      } catch {
        // Missing inline images simply render as broken images.
      }
      if (!isCurrent()) return dispose;
    }
  }

  const showTab = (id: BodyTab) => {
    bodyHost.replaceChildren();
    if (id === "html") {
      const safe = sanitizeEmailHtml(body.html, (cid) => cidUrls.get(cid.replace(/^<|>$/g, "").toLowerCase()));
      if (safe.blockedRemote > 0) bodyHost.append(createNotice(copy.blocked(safe.blockedRemote), "info"));
      const frame = el("iframe", { className: "anyfile-pst__frame", title: detail.subject || copy.noSubject, attrs: { sandbox: "allow-same-origin", referrerpolicy: "no-referrer" } });
      frame.srcdoc = safe.html;
      const fit = () => {
        const height = frame.contentDocument?.documentElement?.scrollHeight;
        if (height) frame.style.height = `${Math.min(Math.max(height + 8, 160), 20_000)}px`;
      };
      frame.addEventListener("load", fit);
      cleanups.push(() => frame.removeEventListener("load", fit));
      bodyHost.append(frame);
    } else {
      bodyHost.append(el("pre", "anyfile-pst__text", id === "text" ? body.text : detail.headers));
    }
  };

  target.replaceChildren(
    el("h2", "anyfile-pst__subject", detail.subject || copy.noSubject),
    createKeyValueList(header),
  );
  if (attachmentList.childElementCount > 0) {
    target.append(el("h3", "anyfile-inspector__heading", `${copy.attachments} (${detail.attachments.length})`), attachmentList);
  }
  if (tabs.length === 0) {
    target.append(createNotice(copy.noBody));
    return dispose;
  }
  if (tabs.length > 1) {
    const bar = createTabBar<BodyTab>({ items: tabs, onChange: showTab });
    cleanups.push(() => bar.dispose());
    target.append(bar.element);
  }
  target.append(bodyHost);
  showTab(tabs[0].id);
  return dispose;
}
