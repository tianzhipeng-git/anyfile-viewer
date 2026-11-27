import type { DataSet, Element } from "./dicom-parser";

/** Keyword and VR for common tags (implicit VR data sets carry no VR on the wire). */
const DICTIONARY: Record<string, readonly [string, string]> = {
  x00020000: ["FileMetaInformationGroupLength", "UL"], x00020001: ["FileMetaInformationVersion", "OB"],
  x00020002: ["MediaStorageSOPClassUID", "UI"], x00020003: ["MediaStorageSOPInstanceUID", "UI"],
  x00020010: ["TransferSyntaxUID", "UI"], x00020012: ["ImplementationClassUID", "UI"],
  x00020013: ["ImplementationVersionName", "SH"], x00020016: ["SourceApplicationEntityTitle", "AE"],
  x00080005: ["SpecificCharacterSet", "CS"], x00080008: ["ImageType", "CS"], x00080012: ["InstanceCreationDate", "DA"],
  x00080016: ["SOPClassUID", "UI"], x00080018: ["SOPInstanceUID", "UI"], x00080020: ["StudyDate", "DA"],
  x00080021: ["SeriesDate", "DA"], x00080022: ["AcquisitionDate", "DA"], x00080023: ["ContentDate", "DA"],
  x00080030: ["StudyTime", "TM"], x00080031: ["SeriesTime", "TM"], x00080032: ["AcquisitionTime", "TM"],
  x00080033: ["ContentTime", "TM"], x00080050: ["AccessionNumber", "SH"], x00080060: ["Modality", "CS"],
  x00080064: ["ConversionType", "CS"], x00080070: ["Manufacturer", "LO"], x00080080: ["InstitutionName", "LO"],
  x00080081: ["InstitutionAddress", "ST"], x00080090: ["ReferringPhysicianName", "PN"],
  x00081010: ["StationName", "SH"], x00081030: ["StudyDescription", "LO"], x0008103e: ["SeriesDescription", "LO"],
  x00081040: ["InstitutionalDepartmentName", "LO"], x00081050: ["PerformingPhysicianName", "PN"],
  x00081070: ["OperatorsName", "PN"], x00081090: ["ManufacturerModelName", "LO"],
  x00100010: ["PatientName", "PN"], x00100020: ["PatientID", "LO"], x00100030: ["PatientBirthDate", "DA"],
  x00100040: ["PatientSex", "CS"], x00101010: ["PatientAge", "AS"], x00101020: ["PatientSize", "DS"],
  x00101030: ["PatientWeight", "DS"], x00101040: ["PatientAddress", "LO"],
  x00180015: ["BodyPartExamined", "CS"], x00180050: ["SliceThickness", "DS"], x00180060: ["KVP", "DS"],
  x00181020: ["SoftwareVersions", "LO"], x00185100: ["PatientPosition", "CS"],
  x0020000d: ["StudyInstanceUID", "UI"], x0020000e: ["SeriesInstanceUID", "UI"], x00200010: ["StudyID", "SH"],
  x00200011: ["SeriesNumber", "IS"], x00200013: ["InstanceNumber", "IS"], x00200032: ["ImagePositionPatient", "DS"],
  x00200037: ["ImageOrientationPatient", "DS"], x00200052: ["FrameOfReferenceUID", "UI"],
  x00201041: ["SliceLocation", "DS"], x00280002: ["SamplesPerPixel", "US"],
  x00280004: ["PhotometricInterpretation", "CS"], x00280006: ["PlanarConfiguration", "US"],
  x00280008: ["NumberOfFrames", "IS"], x00280010: ["Rows", "US"], x00280011: ["Columns", "US"],
  x00280030: ["PixelSpacing", "DS"], x00280100: ["BitsAllocated", "US"], x00280101: ["BitsStored", "US"],
  x00280102: ["HighBit", "US"], x00280103: ["PixelRepresentation", "US"], x00280120: ["PixelPaddingValue", "US"],
  x00280121: ["PixelPaddingRangeLimit", "US"], x00281050: ["WindowCenter", "DS"], x00281051: ["WindowWidth", "DS"],
  x00281052: ["RescaleIntercept", "DS"], x00281053: ["RescaleSlope", "DS"], x00281054: ["RescaleType", "LO"],
  x00281056: ["VOILUTFunction", "CS"], x00283000: ["ModalityLUTSequence", "SQ"], x00283010: ["VOILUTSequence", "SQ"],
  x7fe00010: ["PixelData", "OW"],
};

/**
 * Patient-identifying values are masked by default: the whole patient group except sex/age/size/weight,
 * every person name (PN) and every private tag, plus institution, staff and accession identifiers.
 */
const PATIENT_DESCRIPTIVE = new Set(["x00100040", "x00101010", "x00101020", "x00101030"]);
const IDENTIFYING = new Set([
  "x00080050", "x00080080", "x00080081", "x00080090", "x00080092", "x00080094", "x00081010", "x00081040",
  "x00081048", "x00081050", "x00081060", "x00081070", "x00200010", "x00321032", "x00380010", "x0040a123",
]);
const NUMERIC: Record<string, readonly [number, (view: DataView, offset: number, little: boolean) => number]> = {
  US: [2, (v, o, le) => v.getUint16(o, le)], SS: [2, (v, o, le) => v.getInt16(o, le)],
  UL: [4, (v, o, le) => v.getUint32(o, le)], SL: [4, (v, o, le) => v.getInt32(o, le)],
  FL: [4, (v, o, le) => v.getFloat32(o, le)], FD: [8, (v, o, le) => v.getFloat64(o, le)],
};
const BINARY = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "UN"]);
const MAX_VALUE_CHARS = 200;

export const tagKeyword = (tag: string) => DICTIONARY[tag]?.[0];

export function isIdentifying(tag: string, vr: string | undefined): boolean {
  const group = Number.parseInt(tag.slice(1, 5), 16);
  return vr === "PN" || IDENTIFYING.has(tag) || group % 2 === 1 || (group === 0x0010 && !PATIENT_DESCRIPTIVE.has(tag));
}

const formatTag = (tag: string) => `(${tag.slice(1, 5)},${tag.slice(5)})`.toUpperCase();

function formatValue(data: DataSet, element: Element, vr: string | undefined, bigEndian: boolean): string {
  if (element.tag === "x7fe00010") return `<pixel data, ${element.length} bytes, not read>`;
  if (vr === "SQ" || element.items) return `<sequence, ${element.items?.length ?? 0} items>`;
  if (element.hadUndefinedLength || element.length === 0xffffffff) return "<undefined length>";
  if (vr && BINARY.has(vr)) return `<binary ${element.length} bytes>`;
  const numeric = vr ? NUMERIC[vr] : undefined;
  if (numeric) {
    const [size, read] = numeric;
    const view = new DataView(data.byteArray.buffer, data.byteArray.byteOffset + element.dataOffset, element.length);
    const values: string[] = [];
    for (let offset = 0; offset + size <= element.length && values.length < 16; offset += size) {
      values.push(String(read(view, offset, !bigEndian)));
    }
    return element.length / size > 16 ? `${values.join("\\")}… (${element.length / size} values)` : values.join("\\");
  }
  if (vr === "AT") return `<tag list, ${element.length} bytes>`;
  const raw = data.byteArray.subarray(element.dataOffset, element.dataOffset + Math.min(element.length, MAX_VALUE_CHARS + 1));
  // Unknown implicit-VR values are shown only when they look like text.
  if (!vr && raw.some((byte) => (byte < 0x20 && byte !== 0x0a && byte !== 0x0d && byte !== 0) || byte > 0x7e)) {
    return `<binary ${element.length} bytes>`;
  }
  const text = new TextDecoder("latin1").decode(raw).replace(/[\0 ]+$/, "").replace(/\s+/g, " ");
  return element.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}… (${element.length} bytes)` : text;
}

export type TagRow = readonly [tag: string, keyword: string, vr: string, value: string];

/** Top-level elements as table rows; sequences are summarized, never descended (they may nest identifiers). */
export function dicomTagRows(data: DataSet, bigEndian: boolean): TagRow[] {
  return Object.keys(data.elements).sort().map((tag) => {
    const element = data.elements[tag];
    const vr = element.vr ?? DICTIONARY[tag]?.[1];
    const groupBigEndian = bigEndian && !tag.startsWith("x0002");
    const value = isIdentifying(tag, vr) ? "<masked>" : formatValue(data, element, vr, groupBigEndian);
    return [formatTag(tag), tagKeyword(tag) ?? "", vr ?? "", value];
  });
}
