import { abortError } from "@anyfile/viewer-protocol";

import { decodeIwaStream, readIwaObjects, type IwaObject } from "./iwa";
import { buildLegacyModel } from "./legacy";
import type { IworkLayout } from "./layout";
import { buildIwaModel, type IworkApp, type IworkModel } from "./model";
import { IWORK_LIMITS, PackageLimitError, type IworkPackage } from "./package";

async function readIwaFiles(pkg: IworkPackage, prefix: string, app: IworkApp, signal: AbortSignal) {
  const index = `${prefix}Index/`;
  const wanted = [...pkg.names].filter((name) => {
    if (!name.startsWith(index)) return false;
    const local = name.slice(index.length);
    if (local === "Document.iwa" || local === "Metadata.iwa") return true;
    return app === "keynote" && /^Slide(-[^/]*)?\.iwa$/.test(local);
  });
  if (app === "keynote" && wanted.length > IWORK_LIMITS.slides + 2) throw new PackageLimitError("Too many slides.");
  const files = new Map<string, readonly IwaObject[]>();
  let budget = IWORK_LIMITS.expandedBytes;
  for (const name of wanted) {
    if (signal.aborted) throw abortError();
    const stream = decodeIwaStream(await pkg.bytes(name, IWORK_LIMITS.entryBytes), budget);
    budget -= stream.length;
    files.set(name.slice(index.length), readIwaObjects(stream));
  }
  return files;
}

async function readLegacyXml(pkg: IworkPackage, path: string) {
  const blob = await pkg.blob(path, IWORK_LIMITS.entryBytes);
  if (!path.endsWith(".gz")) return blob.text();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  const reader = blob.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  try {
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.length;
      if (size > IWORK_LIMITS.expandedBytes) throw new PackageLimitError("Expanded XML exceeds the limit.");
      chunks.push(read.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new Blob(chunks).text();
}

/** Resolves a data id to an existing `Data/` entry, preferring the recorded file name. */
function dataResolver(names: ReadonlySet<string>, prefix: string) {
  const data = `${prefix}Data/`;
  const entries = [...names].filter((name) => name.startsWith(data));
  return (id: number, name?: string) => {
    const exact = name ? `${data}${name.normalize("NFC")}` : undefined;
    if (exact && names.has(exact)) return exact;
    const suffix = `-${id}.`;
    return entries.find((entry) => entry.slice(data.length).includes(suffix));
  };
}

/** Builds the text model of an unencrypted package; shared by the viewer and `./extract`. */
export async function buildIworkModel(
  pkg: IworkPackage,
  layout: Exclude<IworkLayout, { kind: "encrypted" }>,
  app: IworkApp,
  signal: AbortSignal,
): Promise<IworkModel> {
  if (layout.kind === "xml") {
    const model = buildLegacyModel(app, await readLegacyXml(pkg, layout.index));
    const sections = model.sections.map((section) => ({ ...section, image: section.image ? layout.prefix + section.image : undefined }));
    return { ...model, sections };
  }
  if (layout.kind === "iwa-zip") await pkg.mountNested(`${layout.prefix}Index.zip`, layout.prefix);
  const files = await readIwaFiles(pkg, layout.prefix, app, signal);
  return buildIwaModel(app, files, dataResolver(pkg.names, layout.prefix));
}
