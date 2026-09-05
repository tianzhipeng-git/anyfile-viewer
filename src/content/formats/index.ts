import { cadExchangeFormats } from "./cad-exchange";
import { pointFormats } from "./point-cloud";
import { meshFormats } from "./mesh-3d";
import type { FormatContent } from "../types";

import { goPro360Format } from "./360";
import { lotus123Format } from "./123";
import { threeGpFormat } from "./3gp";
import { aacFormat } from "./aac";
import { aiFormat } from "./ai";
import { aabFormat } from "./aab";
import { apngFormat } from "./apng";
import { apkFormat } from "./apk";
import { arwFormat } from "./arw";
import { arrowFormat } from "./arrow";
import { avifFormat } from "./avif";
import { bmpFormat } from "./bmp";
import { brFormat } from "./br";
import { bz2Format } from "./bz2";
import { cbzFormat } from "./cbz";
import { cr2Format } from "./cr2";
import { cr3Format } from "./cr3";
import { crwFormat } from "./crw";
import { csvFormat } from "./csv";
import { curFormat } from "./cur";
import { dbfFormat } from "./dbf";
import { deflateFormat } from "./deflate";
import { difFormat } from "./dif";
import { dngFormat } from "./dng";
import { dxfFormat } from "./dxf";
import { docxFormat } from "./docx";
import { duckdbFormat } from "./duckdb";
import { earFormat } from "./ear";
import { eggFormat } from "./egg";
import { epubFormat } from "./epub";
import { epsFormat } from "./eps";
import { etFormat } from "./et";
import { flacFormat } from "./flac";
import { fodsFormat } from "./fods";
import { geotiffFormat } from "./geotiff";
import { gifFormat } from "./gif";
import { gzFormat } from "./gz";
import { harFormat } from "./har";
import { heicFormat } from "./heic";
import { icoFormat } from "./ico";
import { inspFormat } from "./insp";
import { insvFormat } from "./insv";
import { ipaFormat } from "./ipa";
import { jarFormat } from "./jar";
import { jmodFormat } from "./jmod";
import { jpgFormat } from "./jpg";
import { jsonFormat } from "./json";
import { jsonlFormat } from "./jsonl";
import { jxlFormat } from "./jxl";
import { kmzFormat } from "./kmz";
import { lz4Format } from "./lz4";
import { lrvFormat } from "./lrv";
import { m2tsFormat } from "./m2ts";
import { m4aFormat } from "./m4a";
import { mapFormat } from "./map";
import { mdFormat } from "./md";
import { mkaFormat } from "./mka";
import { mkvFormat } from "./mkv";
import { movFormat } from "./mov";
import { mp3Format } from "./mp3";
import { mp4Format } from "./mp4";
import { nefFormat } from "./nef";
import { npyFormat } from "./npy";
import { npzFormat } from "./npz";
import { numbersFormat } from "./numbers";
import { nupkgFormat } from "./nupkg";
import { odfFormat } from "./odf";
import { odgFormat } from "./odg";
import { odpFormat } from "./odp";
import { odsFormat } from "./ods";
import { odtFormat } from "./odt";
import { oggFormat } from "./ogg";
import { ogvFormat } from "./ogv";
import { omeTiffFormat } from "./ome-tiff";
import { opusFormat } from "./opus";
import { orfFormat } from "./orf";
import { osvFormat } from "./osv";
import { parquetFormat } from "./parquet";
import { pdfFormat } from "./pdf";
import { pefFormat } from "./pef";
import { pngFormat } from "./png";
import { psbFormat } from "./psb";
import { psdFormat } from "./psd";
import { psFormat } from "./ps";
import { pnmFormat } from "./pnm";
import { prnFormat } from "./prn";
import { pptxFormat } from "./pptx";
import { pyzFormat } from "./pyz";
import { pxdFormat } from "./pxd";
import { qpwFormat } from "./qpw";
import { rafFormat } from "./raf";
import { rarFormat } from "./rar";
import { rawFormat } from "./raw";
import { rwlFormat } from "./rwl";
import { rw2Format } from "./rw2";
import { slkFormat } from "./slk";
import { snupkgFormat } from "./snupkg";
import { sqliteFormat } from "./sqlite";
import { svgFormat } from "./svg";
import { tarFormat } from "./tar";
import { tgaFormat } from "./tga";
import { tiffFormat } from "./tiff";
import { tsFormat } from "./ts";
import { tsvFormat } from "./tsv";
import { txtFormat } from "./txt";
import { usdzFormat } from "./usdz";
import { vsixFormat } from "./vsix";
import { wasmFormat } from "./wasm";
import { warFormat } from "./war";
import { wavFormat } from "./wav";
import { wb1Format } from "./wb1";
import { webpFormat } from "./webp";
import { webmFormat } from "./webm";
import { whlFormat } from "./whl";
import { wk1Format } from "./wk1";
import { wq1Format } from "./wq1";
import { xlrFormat } from "./xlr";
import { xlsFormat } from "./xls";
import { xlsbFormat } from "./xlsb";
import { xlsmFormat } from "./xlsm";
import { xlsxFormat } from "./xlsx";
import { xmlFormat } from "./xml";
import { xzFormat } from "./xz";
import { xpiFormat } from "./xpi";
import { zipFormat } from "./zip";
import { zlibFormat } from "./zlib";
import { zstFormat } from "./zst";

export const formatContents: readonly FormatContent[] = [
  ...cadExchangeFormats, ...meshFormats,
  ...pointFormats,
  goPro360Format,
  lotus123Format,
  threeGpFormat,
  aacFormat,
  aiFormat,
  aabFormat,
  apngFormat,
  apkFormat,
  arwFormat,
  arrowFormat,
  avifFormat,
  bmpFormat,
  brFormat,
  bz2Format,
  cbzFormat,
  cr2Format,
  cr3Format,
  crwFormat,
  csvFormat,
  curFormat,
  dbfFormat,
  deflateFormat,
  difFormat,
  dngFormat,
  dxfFormat,
  docxFormat,
  duckdbFormat,
  earFormat,
  eggFormat,
  epubFormat,
  epsFormat,
  etFormat,
  flacFormat,
  fodsFormat,
  geotiffFormat,
  gifFormat,
  gzFormat,
  harFormat,
  heicFormat,
  icoFormat,
  inspFormat,
  insvFormat,
  ipaFormat,
  jarFormat,
  jmodFormat,
  jpgFormat,
  jsonFormat,
  jsonlFormat,
  jxlFormat,
  kmzFormat,
  lz4Format,
  lrvFormat,
  m2tsFormat,
  m4aFormat,
  mapFormat,
  mdFormat,
  mkaFormat,
  mkvFormat,
  movFormat,
  mp3Format,
  mp4Format,
  nefFormat,
  npyFormat,
  npzFormat,
  numbersFormat,
  nupkgFormat,
  odfFormat,
  odgFormat,
  odpFormat,
  odsFormat,
  odtFormat,
  oggFormat,
  ogvFormat,
  omeTiffFormat,
  opusFormat,
  orfFormat,
  osvFormat,
  parquetFormat,
  pdfFormat,
  pefFormat,
  pngFormat,
  psbFormat,
  psdFormat,
  psFormat,
  pnmFormat,
  prnFormat,
  pptxFormat,
  pyzFormat,
  pxdFormat,
  qpwFormat,
  rafFormat,
  rarFormat,
  rawFormat,
  rwlFormat,
  rw2Format,
  slkFormat,
  snupkgFormat,
  sqliteFormat,
  svgFormat,
  tarFormat,
  tgaFormat,
  tiffFormat,
  tsFormat,
  tsvFormat,
  txtFormat,
  usdzFormat,
  vsixFormat,
  wasmFormat,
  warFormat,
  wavFormat,
  wb1Format,
  webmFormat,
  webpFormat,
  whlFormat,
  wk1Format,
  wq1Format,
  xlrFormat,
  xlsFormat,
  xlsbFormat,
  xlsmFormat,
  xlsxFormat,
  xmlFormat,
  xzFormat,
  xpiFormat,
  zipFormat,
  zlibFormat,
  zstFormat,
];
