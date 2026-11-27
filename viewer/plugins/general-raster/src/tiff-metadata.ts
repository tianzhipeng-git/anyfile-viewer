import { GeoTIFF, globals, type GeoTIFFImage } from "geotiff";
import type { BinarySource, JsonValue } from "@anyfile/viewer-protocol";

import { compressionNames } from "./decode-tiff";

export { decodeTiffDocument } from "./decode-tiff";

type GeoTiffSource = Parameters<typeof GeoTIFF.fromSource>[0];

/** Opens a TIFF through range reads on a `BinarySource` (Node has no FileReader for `fromBlob`). */
export function openTiffFromSource(source: BinarySource, signal: AbortSignal): Promise<GeoTIFF> {
  const adapter = {
    fileSize: source.size,
    fetch: (slices: readonly { offset: number; length: number }[], sliceSignal?: AbortSignal) =>
      Promise.all(slices.map(async ({ offset, length }) => {
        const bytes = await source.read(offset, length, sliceSignal ?? signal);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      })),
    close: async () => undefined,
  };
  return GeoTIFF.fromSource(adapter as unknown as GeoTiffSource, undefined, signal);
}

export function toJson(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) return Array.from(value as ArrayLike<unknown>, toJson);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  return String(value);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const text = value.replace(/\0+$/, "").replace(/\s+/g, " ");
    return text.length > 200 ? `${text.slice(0, 200)}… (${text.length} chars)` : text;
  }
  if (value instanceof Uint8Array && value.length > 32) return `<binary ${value.length} bytes>`;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    const values = Array.from(value as ArrayLike<unknown>, String);
    return values.length > 16 ? `${values.slice(0, 16).join(", ")}, … (${values.length} values)` : values.join(", ");
  }
  return String(value);
}

const tagName = (tag: string | number) =>
  typeof tag === "number" ? (globals.getTag(tag)?.name ?? `Tag ${tag}`) : tag;

/** IFD tags as `[name, value]` rows; large deferred arrays (strip/tile offsets) are summarized, not loaded. */
export async function tiffTagRows(image: GeoTIFFImage): Promise<[string, string][]> {
  const directory = image.getFileDirectory();
  const rows: [string, string][] = [];
  for (const [tag, value] of directory.actualizedFields) rows.push([tagName(tag), formatValue(value)]);
  for (const tag of directory.deferredFields.keys()) rows.push([tagName(tag), formatValue(await directory.loadValue(tag as number))]);
  for (const [tag, array] of directory.deferredArrays) rows.push([tagName(tag), `<${array.length} values>`]);
  return rows;
}

/** GeoTIFF keys, CRS and bounds; `undefined` for plain TIFF pages. */
export function tiffGeoMetadata(image: GeoTIFFImage): Record<string, JsonValue> | undefined {
  let keys: ReturnType<GeoTIFFImage["getGeoKeys"]>;
  try {
    keys = image.getGeoKeys();
  } catch {
    return undefined;
  }
  if (!keys) return undefined;
  const geo: Record<string, JsonValue> = { geoKeys: toJson(keys) };
  const epsg = [keys.ProjectedCSTypeGeoKey, keys.GeographicTypeGeoKey].find(
    (code) => typeof code === "number" && code > 0 && code !== 32767,
  );
  if (epsg !== undefined) geo.crs = `EPSG:${epsg}`;
  try {
    geo.origin = toJson(image.getOrigin());
    geo.resolution = toJson(image.getResolution());
    geo.bounds = toJson(image.getBoundingBox());
  } catch {
    // Geo keys without an affine transform: keys only.
  }
  return geo;
}

/** Page facts without decoding pixels; width/height are as displayed (after orientation). */
export async function tiffPageInfo(image: GeoTIFFImage, format: string): Promise<Record<string, JsonValue>> {
  const directory = image.getFileDirectory();
  const bits = Array.from((await directory.loadValue("BitsPerSample")) as ArrayLike<number> | undefined ?? [8]);
  const orientation = Number((await directory.loadValue("Orientation")) ?? 1);
  const swap = orientation >= 5 && orientation <= 8;
  const compression = Number((await directory.loadValue("Compression")) ?? 1);
  const info: Record<string, JsonValue> = {
    format,
    width: swap ? image.getHeight() : image.getWidth(),
    height: swap ? image.getWidth() : image.getHeight(),
    bitDepth: Math.max(...bits),
    samplesPerPixel: image.getSamplesPerPixel(),
    photometric: Number((await directory.loadValue("PhotometricInterpretation")) ?? 1),
    compression: compressionNames[compression] ?? `TIFF ${compression}`,
    tiled: image.isTiled,
    orientation,
    iccProfile: directory.hasTag("ICCProfile"),
  };
  const geo = tiffGeoMetadata(image);
  if (geo) info.geo = geo;
  return info;
}
