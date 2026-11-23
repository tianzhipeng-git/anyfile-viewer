import { IwaFormatError, protoMessages, protoNumber, readProto, type IwaObject, type ProtoFields } from "./iwa";

export type IworkApp = "pages" | "keynote";

export type IworkSection = {
  readonly role: "body" | "text-boxes" | "slide";
  readonly paragraphs: readonly string[];
  readonly notes: readonly string[];
  /** Package path of the section thumbnail (Keynote slide thumbnails). */
  readonly image?: string;
};

export type IworkModel = {
  readonly app: IworkApp;
  readonly generation: "iwa" | "xml";
  readonly sections: readonly IworkSection[];
};

/** Decoded `Index/*.iwa` streams keyed by path relative to `Index/`. */
export type IwaFiles = ReadonlyMap<string, readonly IwaObject[]>;

const STORAGE_TYPE = 2001;
const STORAGE_KIND_BODY = 0;
const STORAGE_KIND_NOTE = 4;
const PAGES_DOCUMENT_TYPE = 10000;
const KEYNOTE_DOCUMENT_TYPE = 1;
const KEYNOTE_SHOW_TYPE = 2;
const KEYNOTE_SLIDE_NODE_TYPE = 4;
const KEYNOTE_SLIDE_TYPE = 5;
const PACKAGE_METADATA_TYPE = 11006;
const MAX_SLIDE_DEPTH = 32;

const decoder = new TextDecoder();

/** Splits iWork storage text into visible paragraphs, dropping attachment placeholders. */
export function splitParagraphs(text: string) {
  return text
    .replace(/\uFFFC/g, "")
    .split(/[\n\r\u2029\u000c\u000e\u0004\u0005]/)
    .map((paragraph) => paragraph.replace(/\u2028/g, "\n").replace(/[\u0000-\u0009\u000b\u000f-\u001f]/g, "").trim())
    .filter(Boolean);
}

type Located = { readonly file: string; readonly type: number; readonly fields: ProtoFields };

function indexObjects(files: IwaFiles) {
  const objects = new Map<number, Located>();
  for (const [file, list] of files) {
    for (const object of list) {
      const message = object.messages[0];
      if (!message || objects.has(object.id)) continue;
      objects.set(object.id, { file, type: message.type, get fields() { return readProto(message.data); } });
    }
  }
  return objects;
}

function referenceId(fields: ProtoFields, field: number) {
  const raw = protoMessages(fields, field)[0];
  return raw ? protoNumber(readProto(raw), 1) : undefined;
}

function storageText(fields: ProtoFields) {
  return protoMessages(fields, 3).map((chunk) => decoder.decode(chunk)).join("");
}

function storages(list: readonly IwaObject[]) {
  const result: { id: number; kind: number | undefined; text: string }[] = [];
  for (const object of list) {
    for (const message of object.messages) {
      if (message.type !== STORAGE_TYPE) continue;
      const fields = readProto(message.data);
      result.push({ id: object.id, kind: protoNumber(fields, 1), text: storageText(fields) });
    }
  }
  return result;
}

function buildPages(files: IwaFiles): IworkModel {
  const documentFile = files.get("Document.iwa");
  const root = documentFile?.find((object) => object.id === 1)?.messages[0];
  if (!documentFile || root?.type !== PAGES_DOCUMENT_TYPE) throw new IwaFormatError("Missing Pages document archive.");
  const bodyId = referenceId(readProto(root.data), 4);
  const all = storages(documentFile);
  const body = all.find((storage) => storage.id === bodyId && storage.kind === STORAGE_KIND_BODY);
  const sections: IworkSection[] = [];
  const bodyParagraphs = body ? splitParagraphs(body.text) : [];
  if (bodyParagraphs.length) sections.push({ role: "body", paragraphs: bodyParagraphs, notes: [] });
  const boxes = all
    .filter((storage) => storage !== body && (storage.kind === undefined || storage.kind === 3))
    .flatMap((storage) => splitParagraphs(storage.text));
  if (boxes.length) sections.push({ role: "text-boxes", paragraphs: boxes, notes: [] });
  return { app: "pages", generation: "iwa", sections };
}

function dataFileNames(files: IwaFiles) {
  const names = new Map<number, string>();
  for (const object of files.get("Metadata.iwa") ?? []) {
    for (const message of object.messages) {
      if (message.type !== PACKAGE_METADATA_TYPE) continue;
      for (const raw of protoMessages(readProto(message.data), 4)) {
        const info = readProto(raw);
        const id = protoNumber(info, 1);
        const name = protoMessages(info, 4)[0] ?? protoMessages(info, 3)[0];
        if (id !== undefined && name) names.set(id, decoder.decode(name));
      }
    }
  }
  return names;
}

/** Title placeholder, body placeholder, then the slide's drawables; unreferenced text keeps stream order. */
function orderSlideText(objects: ReadonlyMap<number, Located>, slide: ProtoFields, texts: ReturnType<typeof storages>) {
  const rank = new Map<number, number>();
  const drawables = [5, 6, 7].flatMap((field) => protoMessages(slide, field).map((raw) => protoNumber(readProto(raw), 1)));
  for (const drawableId of drawables) {
    const drawable = objects.get(drawableId ?? -1);
    // Text-bearing drawables (placeholders, shapes) extend TSWP.ShapeInfoArchive: field 1, owned storage at 2.
    const shape = drawable && protoMessages(drawable.fields, 1)[0];
    const storageId = shape ? referenceId(readProto(shape), 2) : undefined;
    if (storageId !== undefined && !rank.has(storageId)) rank.set(storageId, rank.size);
  }
  return texts
    .map((text, index) => ({ text, order: rank.get(text.id) ?? rank.size + index }))
    .sort((a, b) => a.order - b.order)
    .map(({ text }) => text);
}

function buildKeynote(files: IwaFiles, resolveData: (id: number, name?: string) => string | undefined): IworkModel {
  const objects = indexObjects(files);
  const root = objects.get(1);
  if (root?.type !== KEYNOTE_DOCUMENT_TYPE) throw new IwaFormatError("Missing Keynote document archive.");
  const show = objects.get(referenceId(root.fields, 2) ?? -1);
  if (show?.type !== KEYNOTE_SHOW_TYPE) throw new IwaFormatError("Missing Keynote show archive.");
  const treeRaw = protoMessages(show.fields, 3)[0];
  const tree = treeRaw ? readProto(treeRaw) : new Map();
  const dataNames = dataFileNames(files);
  const sections: IworkSection[] = [];
  const visited = new Set<number>();

  const visit = (nodeId: number, depth: number) => {
    if (depth > MAX_SLIDE_DEPTH || visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = objects.get(nodeId);
    if (node?.type !== KEYNOTE_SLIDE_NODE_TYPE) return;
    const slide = objects.get(referenceId(node.fields, 2) ?? -1);
    if (slide?.type === KEYNOTE_SLIDE_TYPE) {
      const own = files.get(slide.file) ?? [];
      // Keynote stores each slide with its drawables in its own Slide-*.iwa stream.
      const slideCount = own.filter((object) => object.messages[0]?.type === KEYNOTE_SLIDE_TYPE).length;
      const texts = slideCount === 1 ? orderSlideText(objects, slide.fields, storages(own)) : [];
      const thumbnailRaw = protoMessages(node.fields, 16)[0];
      const thumbnailId = thumbnailRaw ? protoNumber(readProto(thumbnailRaw), 1) : undefined;
      sections.push({
        role: "slide",
        paragraphs: texts.filter((text) => text.kind !== STORAGE_KIND_NOTE).flatMap((text) => splitParagraphs(text.text)),
        notes: texts.filter((text) => text.kind === STORAGE_KIND_NOTE).flatMap((text) => splitParagraphs(text.text)),
        image: thumbnailId === undefined ? undefined : resolveData(thumbnailId, dataNames.get(thumbnailId)),
      });
    }
    for (const raw of protoMessages(node.fields, 1)) {
      const child = protoNumber(readProto(raw), 1);
      if (child !== undefined) visit(child, depth + 1);
    }
  };
  for (const raw of protoMessages(tree, 2)) {
    const nodeId = protoNumber(readProto(raw), 1);
    if (nodeId !== undefined) visit(nodeId, 0);
  }
  return { app: "keynote", generation: "iwa", sections };
}

/**
 * Builds the text model from decoded IWA streams. `resolveData` maps a data id and its recorded
 * file name to a package path that actually exists.
 */
export function buildIwaModel(
  app: IworkApp,
  files: IwaFiles,
  resolveData: (id: number, name?: string) => string | undefined,
): IworkModel {
  return app === "pages" ? buildPages(files) : buildKeynote(files, resolveData);
}
