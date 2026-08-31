import type { FormatContent } from "../types";

import { aacFormat } from "./aac";
import { arrowFormat } from "./arrow";
import { brFormat } from "./br";
import { bz2Format } from "./bz2";
import { csvFormat } from "./csv";
import { deflateFormat } from "./deflate";
import { dngFormat } from "./dng";
import { docxFormat } from "./docx";
import { duckdbFormat } from "./duckdb";
import { flacFormat } from "./flac";
import { gzFormat } from "./gz";
import { harFormat } from "./har";
import { heicFormat } from "./heic";
import { jarFormat } from "./jar";
import { jmodFormat } from "./jmod";
import { jpgFormat } from "./jpg";
import { jsonFormat } from "./json";
import { jxlFormat } from "./jxl";
import { lz4Format } from "./lz4";
import { m2tsFormat } from "./m2ts";
import { mapFormat } from "./map";
import { mdFormat } from "./md";
import { mkaFormat } from "./mka";
import { mkvFormat } from "./mkv";
import { movFormat } from "./mov";
import { mp3Format } from "./mp3";
import { mp4Format } from "./mp4";
import { npyFormat } from "./npy";
import { npzFormat } from "./npz";
import { oggFormat } from "./ogg";
import { ogvFormat } from "./ogv";
import { parquetFormat } from "./parquet";
import { pdfFormat } from "./pdf";
import { pngFormat } from "./png";
import { pnmFormat } from "./pnm";
import { pptxFormat } from "./pptx";
import { rarFormat } from "./rar";
import { sqliteFormat } from "./sqlite";
import { svgFormat } from "./svg";
import { tarFormat } from "./tar";
import { tgaFormat } from "./tga";
import { tiffFormat } from "./tiff";
import { tsvFormat } from "./tsv";
import { wasmFormat } from "./wasm";
import { wavFormat } from "./wav";
import { webmFormat } from "./webm";
import { xlsxFormat } from "./xlsx";
import { xzFormat } from "./xz";
import { zipFormat } from "./zip";
import { zlibFormat } from "./zlib";
import { zstFormat } from "./zst";

export const formatContents: readonly FormatContent[] = [
  aacFormat,
  arrowFormat,
  brFormat,
  bz2Format,
  csvFormat,
  deflateFormat,
  dngFormat,
  docxFormat,
  duckdbFormat,
  flacFormat,
  gzFormat,
  harFormat,
  heicFormat,
  jarFormat,
  jmodFormat,
  jpgFormat,
  jsonFormat,
  jxlFormat,
  lz4Format,
  m2tsFormat,
  mapFormat,
  mdFormat,
  mkaFormat,
  mkvFormat,
  movFormat,
  mp3Format,
  mp4Format,
  npyFormat,
  npzFormat,
  oggFormat,
  ogvFormat,
  parquetFormat,
  pdfFormat,
  pngFormat,
  pnmFormat,
  pptxFormat,
  rarFormat,
  sqliteFormat,
  svgFormat,
  tarFormat,
  tgaFormat,
  tiffFormat,
  tsvFormat,
  wasmFormat,
  wavFormat,
  webmFormat,
  xlsxFormat,
  xzFormat,
  zipFormat,
  zlibFormat,
  zstFormat,
];

