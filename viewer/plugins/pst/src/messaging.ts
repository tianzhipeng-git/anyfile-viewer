/**
 * Messaging layer of [MS-PST]: message store, folder hierarchy, contents tables,
 * messages, recipients and attachments. All reads are lazy and bounded.
 */
import { NodeDatabase, type PstNode } from "./ndb";
import { PropertyContext, TableContext, type PropValue, type TableRow } from "./ltp";
import { PST_LIMITS, PstError, invalid } from "./types";

const NID_MESSAGE_STORE = 0x21;
const NID_ROOT_FOLDER = 0x122;
const NID_RECIPIENT_TABLE = 0x692;
const NID_ATTACHMENT_TABLE = 0x671;

export const PROP = {
  subject: 0x0037,
  clientSubmitTime: 0x0039,
  sentRepresentingName: 0x0042,
  senderName: 0x0c1a,
  senderEmail: 0x0c1f,
  senderSmtp: 0x5d01,
  recipientType: 0x0c15,
  displayBcc: 0x0e02,
  displayCc: 0x0e03,
  displayTo: 0x0e04,
  deliveryTime: 0x0e06,
  messageFlags: 0x0e07,
  messageSize: 0x0e08,
  hasAttachments: 0x0e1b,
  attachSize: 0x0e20,
  messageClass: 0x001a,
  transportHeaders: 0x007d,
  body: 0x1000,
  rtfCompressed: 0x1009,
  html: 0x1013,
  displayName: 0x3001,
  emailAddress: 0x3003,
  contentCount: 0x3602,
  contentUnread: 0x3603,
  subfolders: 0x360a,
  containerClass: 0x3613,
  attachData: 0x3701,
  attachFilename: 0x3704,
  attachMethod: 0x3705,
  attachLongFilename: 0x3707,
  attachMime: 0x370e,
  attachContentId: 0x3712,
  smtpAddress: 0x39fe,
  internetCodepage: 0x3fde,
  pstPassword: 0x67ff,
} as const;

export interface FolderInfo {
  readonly nid: number;
  readonly name: string;
  readonly contentCount: number;
  readonly unreadCount: number;
  readonly hasSubfolders: boolean;
  readonly containerClass: string;
}

export interface MessageSummary {
  readonly nid: number;
  readonly subject: string;
  readonly from: string;
  readonly to: string;
  readonly date: Date | null;
  readonly size: number | null;
  readonly hasAttachments: boolean;
  readonly messageClass: string;
}

export interface Recipient {
  readonly name: string;
  readonly address: string;
  readonly kind: "to" | "cc" | "bcc";
}

export interface AttachmentInfo {
  readonly nid: number;
  readonly name: string;
  readonly size: number | null;
  readonly mime: string;
  readonly contentId: string;
  readonly embeddedMessage: boolean;
}

export interface MessageDetail {
  readonly nid: number;
  readonly subject: string;
  readonly from: string;
  readonly fromAddress: string;
  readonly date: Date | null;
  readonly messageClass: string;
  readonly recipients: readonly Recipient[];
  readonly displayTo: string;
  readonly displayCc: string;
  readonly text: string;
  readonly html: string;
  readonly rtf: Uint8Array | null;
  readonly headers: string;
  readonly attachments: readonly AttachmentInfo[];
}

const SUMMARY_COLUMNS = [
  PROP.subject, PROP.senderName, PROP.sentRepresentingName, PROP.displayTo, PROP.deliveryTime,
  PROP.clientSubmitTime, PROP.messageFlags, PROP.messageSize, PROP.hasAttachments, PROP.messageClass,
];

const str = (value: PropValue | undefined) => (typeof value === "string" ? value : "");
const num = (value: PropValue | undefined) => (typeof value === "number" ? value : null);
const date = (value: PropValue | undefined) => (value instanceof Date ? value : null);

/** Subjects may start with U+0001 plus a prefix-length char ([MS-PST] 2.5.3.1.1.1). */
export function cleanSubject(subject: string): string {
  return subject.charCodeAt(0) === 1 ? subject.slice(2) : subject;
}

function decodeHtml(value: PropValue, codepage: number | null): string {
  if (typeof value === "string") return value;
  if (!(value instanceof Uint8Array)) return "";
  const label = codepage === 65001 || codepage === null ? "utf-8" : `windows-${codepage}`;
  try {
    return new TextDecoder(label).decode(value);
  } catch {
    return new TextDecoder("utf-8").decode(value);
  }
}

async function readFolder(ndb: NodeDatabase, nid: number): Promise<FolderInfo> {
  const node = await ndb.node(nid);
  if (!node) invalid("Missing folder.");
  const pc = await PropertyContext.open(ndb, node);
  return {
    nid,
    name: await pc.string(PROP.displayName),
    contentCount: num(await pc.get(PROP.contentCount)) ?? 0,
    unreadCount: num(await pc.get(PROP.contentUnread)) ?? 0,
    hasSubfolders: (await pc.get(PROP.subfolders)) === true,
    containerClass: await pc.string(PROP.containerClass),
  };
}

export class PstArchive {
  private constructor(
    readonly ndb: NodeDatabase,
    readonly storeName: string,
    readonly passwordProtected: boolean,
    readonly rootFolder: FolderInfo,
  ) {}

  static async open(file: Blob, signal?: AbortSignal): Promise<PstArchive> {
    const ndb = await NodeDatabase.open(file, signal);
    const storeNode = await ndb.node(NID_MESSAGE_STORE);
    if (!storeNode) invalid("Missing message store.");
    const store = await PropertyContext.open(ndb, storeNode);
    const root = await readFolder(ndb, NID_ROOT_FOLDER);
    return new PstArchive(ndb, await store.string(PROP.displayName), Boolean(await store.get(PROP.pstPassword)), root);
  }

  /**
   * Breadth-first search (bounded) for the folder to show on open: an Inbox with
   * items, else the first mail folder with items. Returns the nid path to it.
   */
  async defaultFolderPath(top: readonly FolderInfo[]): Promise<number[]> {
    const queue = top.map((folder) => ({ folder, path: [folder.nid], depth: 0 }));
    let mail: number[] = [];
    let any: number[] = [];
    for (let visited = 0; queue.length > 0 && visited < 200; visited++) {
      const { folder, path, depth } = queue.shift()!;
      if (folder.contentCount > 0 && /^IPF\./i.test(folder.containerClass)) {
        if (/inbox|收件箱/i.test(folder.name)) return path;
        if (mail.length === 0 && /^IPF\.(?:Note|Imap)$/i.test(folder.containerClass)) mail = path;
        if (any.length === 0) any = path;
      }
      if (folder.hasSubfolders && depth < 3) {
        for (const child of await this.subfolders(folder.nid)) queue.push({ folder: child, path: [...path, child.nid], depth: depth + 1 });
      }
    }
    return mail.length > 0 ? mail : any;
  }

  private async requireNode(nid: number): Promise<PstNode> {
    const node = await this.ndb.node(nid);
    if (!node) invalid(`Missing node ${nid.toString(16)}.`);
    return node;
  }

  /** Child folders, read from the folder's hierarchy table (nid type 0x0D). */
  async subfolders(folderNid: number): Promise<FolderInfo[]> {
    const node = await this.ndb.node((folderNid & ~0x1f) | 0x0d);
    if (!node) return [];
    const table = await TableContext.open(this.ndb, node);
    if (table.rowCount > PST_LIMITS.maxFolderChildren) throw new PstError("resource-limit", "Too many subfolders.");
    const rows = await table.rows(0, table.rowCount, [PROP.displayName, PROP.contentCount, PROP.contentUnread, PROP.subfolders, PROP.containerClass]);
    return rows.map((row) => ({
      nid: num(row.get(0x67f2)) ?? 0,
      name: str(row.get(PROP.displayName)),
      contentCount: num(row.get(PROP.contentCount)) ?? 0,
      unreadCount: num(row.get(PROP.contentUnread)) ?? 0,
      hasSubfolders: row.get(PROP.subfolders) === true,
      containerClass: str(row.get(PROP.containerClass)),
    }));
  }

  /** Opens the folder's contents table (nid type 0x0E) for paged message listing. */
  async contents(folderNid: number): Promise<MessageList> {
    const node = await this.ndb.node((folderNid & ~0x1f) | 0x0e);
    return new MessageList(node ? await TableContext.open(this.ndb, node) : null);
  }

  async message(nid: number): Promise<MessageDetail> {
    const node = await this.requireNode(nid);
    const pc = await PropertyContext.open(this.ndb, node);
    const subnodes = await this.ndb.subnodes(node);
    const recipients: Recipient[] = [];
    const recipientNode = subnodes.get(NID_RECIPIENT_TABLE);
    if (recipientNode) {
      const table = await TableContext.open(this.ndb, recipientNode);
      const rows = await table.rows(0, Math.min(table.rowCount, PST_LIMITS.maxRecipients), [
        PROP.displayName, PROP.smtpAddress, PROP.emailAddress, PROP.recipientType,
      ]);
      for (const row of rows) {
        const type = num(row.get(PROP.recipientType));
        recipients.push({
          name: str(row.get(PROP.displayName)),
          address: str(row.get(PROP.smtpAddress)) || str(row.get(PROP.emailAddress)),
          kind: type === 2 ? "cc" : type === 3 ? "bcc" : "to",
        });
      }
    }
    const attachments: AttachmentInfo[] = [];
    const attachmentNode = subnodes.get(NID_ATTACHMENT_TABLE);
    if (attachmentNode) {
      const table = await TableContext.open(this.ndb, attachmentNode);
      const rows = await table.rows(0, Math.min(table.rowCount, PST_LIMITS.maxAttachments), []);
      for (const row of rows) {
        const attachNid = num(row.get(0x67f2)) ?? 0;
        const sub = subnodes.get(attachNid);
        if (sub) attachments.push(await this.attachmentInfo(sub));
      }
    }
    const html = decodeHtml(await pc.get(PROP.html), num(await pc.get(PROP.internetCodepage)));
    const rtf = await pc.get(PROP.rtfCompressed);
    return {
      nid,
      subject: cleanSubject(await pc.string(PROP.subject)),
      from: (await pc.string(PROP.senderName)) || (await pc.string(PROP.sentRepresentingName)),
      fromAddress: (await pc.string(PROP.senderSmtp)) || (await pc.string(PROP.senderEmail)),
      date: date(await pc.get(PROP.deliveryTime)) ?? date(await pc.get(PROP.clientSubmitTime)),
      messageClass: await pc.string(PROP.messageClass),
      recipients,
      displayTo: await pc.string(PROP.displayTo),
      displayCc: await pc.string(PROP.displayCc),
      text: await pc.string(PROP.body),
      html,
      rtf: rtf instanceof Uint8Array ? rtf : null,
      headers: await pc.string(PROP.transportHeaders),
      attachments,
    };
  }

  private async attachmentInfo(node: PstNode): Promise<AttachmentInfo> {
    const pc = await PropertyContext.open(this.ndb, node);
    return {
      nid: node.nid,
      name: (await pc.string(PROP.attachLongFilename)) || (await pc.string(PROP.attachFilename)) || (await pc.string(PROP.displayName)),
      size: num(await pc.get(PROP.attachSize)),
      mime: await pc.string(PROP.attachMime),
      contentId: await pc.string(PROP.attachContentId),
      embeddedMessage: (await pc.get(PROP.attachMethod)) === 5,
    };
  }

  /** Reads attachment bytes (by-value attachments only). */
  async attachmentData(messageNid: number, attachmentNid: number, limit: number = PST_LIMITS.maxAttachmentBytes): Promise<Uint8Array> {
    const message = await this.requireNode(messageNid);
    const sub = (await this.ndb.subnodes(message)).get(attachmentNid);
    if (!sub) invalid("Missing attachment.");
    const pc = await PropertyContext.open(this.ndb, sub);
    const data = await pc.get(PROP.attachData, limit);
    if (!(data instanceof Uint8Array)) throw new PstError("unsupported", "Attachment has no binary data.");
    return data;
  }
}

/** Paged view of a contents table; rows are decoded on demand. */
export class MessageList {
  constructor(private readonly table: TableContext | null) {}

  get count() {
    return this.table?.rowCount ?? 0;
  }

  async page(start: number, count: number): Promise<MessageSummary[]> {
    if (!this.table) return [];
    const rows = await this.table.rows(start, count, SUMMARY_COLUMNS);
    return rows.map(toSummary);
  }
}

function toSummary(row: TableRow): MessageSummary {
  return {
    nid: num(row.get(0x67f2)) ?? 0,
    subject: cleanSubject(str(row.get(PROP.subject))),
    from: str(row.get(PROP.senderName)) || str(row.get(PROP.sentRepresentingName)),
    to: str(row.get(PROP.displayTo)),
    date: date(row.get(PROP.deliveryTime)) ?? date(row.get(PROP.clientSubmitTime)),
    size: num(row.get(PROP.messageSize)),
    hasAttachments: row.get(PROP.hasAttachments) === true || ((num(row.get(PROP.messageFlags)) ?? 0) & 0x10) !== 0,
    messageClass: str(row.get(PROP.messageClass)),
  };
}
