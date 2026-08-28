import { deflateSync } from "node:zlib";

const encoder = new TextEncoder();

function bytes(value: string) {
  return encoder.encode(value);
}

function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function stream(dictionary: string, data: Uint8Array) {
  return concat([
    bytes(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    bytes("\nendstream"),
  ]);
}

export function createImageOnlyScanPdf() {
  const width = 12;
  const height = 8;
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 3;
      const ink = ((x + y) % 5 === 0) || (x > 2 && x < 10 && y === 4);
      pixels.set(ink ? [24, 36, 52] : [244, 240, 228], offset);
    }
  }

  const content = bytes("q\n240 0 0 160 0 0 cm\n/Scan Do\nQ\n");
  const objects = [
    bytes("<< /Type /Catalog /Pages 2 0 R >>"),
    bytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    bytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 160] /Resources << /XObject << /Scan 4 0 R >> >> /Contents 5 0 R >>"),
    stream(
      `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,
      deflateSync(pixels),
    ),
    stream("", content),
  ];

  const header = concat([bytes("%PDF-1.7\n%"), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), bytes("\n")]);
  const parts = [header];
  const offsets = [0];
  let length = header.length;
  objects.forEach((object, index) => {
    const wrapped = concat([bytes(`${index + 1} 0 obj\n`), object, bytes("\nendobj\n")]);
    offsets.push(length);
    parts.push(wrapped);
    length += wrapped.length;
  });

  const xrefOffset = length;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  parts.push(bytes(xref));
  return concat(parts);
}
