import { parseDicom, type DataSet } from "dicom-parser";
import { ViewerError } from "@anyfile/viewer-protocol";
import { readFileMeta } from "./file-meta";
import { isPart10 } from "./signature";
import { MAX_FRAME_PIXELS, MAX_HEADER_BYTES, type DicomInfo, type WindowSettings } from "./types";

const NATIVE_SYNTAXES = ["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"];
const invalid = () => new ViewerError("invalid-file", "Invalid DICOM data.");
const limit = () => new ViewerError("resource-limit", "DICOM resource limit exceeded.");

export interface DicomSource {
  info: DicomInfo;
  offset: number;
  frameBytes: number;
  stored: number;
  highBit: number;
  signed: boolean;
  planar: boolean;
  slope: number;
  intercept: number;
  voi: string;
  window?: WindowSettings;
  padding?: [number, number];
}

export function inspectDicom(bytes: Uint8Array, fileSize: number): DicomSource {
  if (!isPart10(bytes)) throw invalid();
  const meta = readFileMeta(bytes);
  const syntax = meta.syntax;
  if (!syntax) throw invalid();
  const source: DicomSource = {
    info: { syntax, sopClass: meta.sopClass, modality: "", date: "", width: 0, height: 0, frames: 1, bits: 0, photometric: "" },
    offset: 0, frameBytes: 0, stored: 0, highBit: 0, signed: false, planar: false, slope: 1, intercept: 0, voi: "LINEAR",
  };
  // Deflated/unknown data sets must never reach the parser's unbounded inflater.
  const explicitCompressed = /^1\.2\.840\.10008\.1\.2\.(?:4\.\d+|5)$/.test(syntax);
  if (!NATIVE_SYNTAXES.includes(syntax) && !explicitCompressed) {
    source.info.reason = "syntax";
    return source;
  }
  let data: DataSet;
  try {
    data = parseDicom(bytes, { untilTag: "x7fe00010" });
  } catch {
    if (bytes.length === MAX_HEADER_BYTES && fileSize > bytes.length) throw limit();
    throw invalid();
  }
  const info = source.info;
  info.sopClass = data.string("x00080016") ?? info.sopClass;
  info.modality = data.string("x00080060") ?? "";
  info.date = data.string("x00080020") ?? "";
  info.width = data.uint16("x00280011") ?? 0;
  info.height = data.uint16("x00280010") ?? 0;
  info.frames = data.intString("x00280008") ?? 1;
  info.bits = data.uint16("x00280100") ?? 0;
  info.photometric = data.string("x00280004") ?? "";
  const pixel = data.elements.x7fe00010;
  if (!pixel) {
    if (fileSize > bytes.length) throw limit();
    info.reason = "noImage";
    return source;
  }
  if (!NATIVE_SYNTAXES.includes(syntax)) {
    info.reason = "syntax";
    return source;
  }
  if (!info.width || !info.height || !Number.isSafeInteger(info.frames) || info.frames < 1) throw invalid();
  if (info.width * info.height > MAX_FRAME_PIXELS) throw limit();
  const samples = data.uint16("x00280002") ?? 1;
  source.stored = data.uint16("x00280101") ?? info.bits;
  source.highBit = data.uint16("x00280102") ?? source.stored - 1;
  const representation = data.uint16("x00280103") ?? 0;
  const planar = data.uint16("x00280006") ?? 0;
  source.signed = representation === 1;
  source.planar = planar === 1;
  const mono = samples === 1 && ["MONOCHROME1", "MONOCHROME2"].includes(info.photometric);
  const rgb = samples === 3 && info.photometric === "RGB" && info.bits === 8 && source.stored === 8 && !source.signed && [0, 1].includes(planar);
  if (![8, 16].includes(info.bits) || (!mono && !rgb) || ![0, 1].includes(representation)) {
    info.reason = "pixels";
    return source;
  }
  if (source.stored < 1 || source.stored > info.bits || source.highBit < source.stored - 1 || source.highBit >= info.bits) throw invalid();
  source.offset = pixel.dataOffset;
  source.frameBytes = info.width * info.height * samples * info.bits / 8;
  const total = source.frameBytes * info.frames;
  if (!Number.isSafeInteger(total) || pixel.length < total || pixel.length === 0xffffffff || pixel.dataOffset + pixel.length > fileSize) throw invalid();
  source.slope = data.floatString("x00281053") ?? 1;
  source.intercept = data.floatString("x00281052") ?? 0;
  if (!Number.isFinite(source.slope) || source.slope === 0 || !Number.isFinite(source.intercept)) throw invalid();
  source.voi = data.string("x00281056") ?? "LINEAR";
  // Do not silently misrepresent LUT-based or enhanced per-frame transformations.
  if (data.elements.x00283000 || data.elements.x00283010 || data.elements.x52009229 || data.elements.x52009230 ||
      !["LINEAR", "LINEAR_EXACT", "SIGMOID"].includes(source.voi) ||
      (data.string("x20500020") && data.string("x20500020") !== "IDENTITY")) {
    info.reason = "transform";
    return source;
  }
  const center = data.floatString("x00281050", 0);
  const width = data.floatString("x00281051", 0);
  if (center !== undefined && width !== undefined && Number.isFinite(center) && Number.isFinite(width) && width >= 1) source.window = { center, width };
  const readPadding = source.signed ? data.int16 : data.uint16;
  const padding = readPadding.call(data, "x00280120");
  const end = readPadding.call(data, "x00280121") ?? padding;
  if (padding !== undefined && end !== undefined) source.padding = [Math.min(padding, end), Math.max(padding, end)];
  return source;
}
