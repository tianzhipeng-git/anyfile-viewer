import * as dicomParserModule from "dicom-parser";

// dicom-parser ships a UMD bundle: Node ESM (Agent) exposes it only as `default`; bundlers also expose named exports.
const dicomParser = (dicomParserModule as { default?: typeof dicomParserModule }).default ?? dicomParserModule;

export const { parseDicom, readPart10Header } = dicomParser;
export type { DataSet, Element } from "dicom-parser";
