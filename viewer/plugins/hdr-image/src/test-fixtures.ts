import { zlibSync } from "fflate";

export function floatToHalf(val: number): number {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = val;
  const bits = u32[0];
  const sign = (bits >>> 16) & 0x8000;
  const exp = ((bits >>> 23) & 0xff) - 127 + 15;
  let mant = bits & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >>> (1 - exp);
    return sign | ((mant + 0x1000) >>> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | ((mant + 0x1000) >>> 13);
}

export function encodeRadianceHdr(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => [number, number, number],
  options: { rle?: boolean; xyze?: boolean; comment?: string } = {},
): Uint8Array<ArrayBuffer> {
  const headerLines = [
    "#?RADIANCE",
    ...(options.comment ? [`# ${options.comment}`] : []),
    `FORMAT=32-bit_rle_${options.xyze ? "xyze" : "rgbe"}`,
    "EXPOSURE=1.0",
    "",
    `-Y ${height} +X ${width}`,
    "",
  ];
  const headerBytes = new TextEncoder().encode(headerLines.join("\n"));

  const toRgbe = (r: number, g: number, b: number): [number, number, number, number] => {
    const v = Math.max(r, g, b);
    if (v < 1e-32) return [0, 0, 0, 0];
    const exp = Math.floor(Math.log2(v)) + 1;
    const scale = Math.pow(2, -exp) * 256;
    return [
      Math.max(0, Math.min(255, Math.floor(r * scale))),
      Math.max(0, Math.min(255, Math.floor(g * scale))),
      Math.max(0, Math.min(255, Math.floor(b * scale))),
      Math.max(0, Math.min(255, exp + 128)),
    ];
  };

  const body: number[] = [];
  const useNewRle = Boolean(options.rle) && width >= 8 && width <= 0x7fff;

  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(width * 4);
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelAt(x, y);
      const [er, eg, eb, ee] = toRgbe(r, g, b);
      row[x * 4] = er;
      row[x * 4 + 1] = eg;
      row[x * 4 + 2] = eb;
      row[x * 4 + 3] = ee;
    }
    if (!useNewRle) {
      for (let i = 0; i < row.length; i++) body.push(row[i]);
    } else {
      body.push(2, 2, (width >>> 8) & 0xff, width & 0xff);
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < width) {
          const chunk = Math.min(128, width - x);
          body.push(chunk);
          for (let k = 0; k < chunk; k++) body.push(row[(x + k) * 4 + ch]);
          x += chunk;
        }
      }
    }
  }

  const out = new Uint8Array(headerBytes.length + body.length);
  out.set(headerBytes, 0);
  out.set(body, headerBytes.length);
  return out;
}

function exrPredictAndSplit(raw: Uint8Array): Uint8Array {
  const len = raw.byteLength;
  const half = (len + 1) >> 1;
  const buf = new Uint8Array(len);
  let t1 = 0;
  let t2 = half;
  let s = 0;
  while (s < len) {
    buf[t1++] = raw[s++];
    if (s < len) buf[t2++] = raw[s++];
  }
  for (let i = len - 1; i > 0; i--) {
    buf[i] = (buf[i] - buf[i - 1] + 128) & 0xff;
  }
  return buf;
}

export interface SyntheticExrChannel {
  readonly name: string;
  readonly pixelType: 1 | 2; // 1=HALF, 2=FLOAT
  readonly valueAt: (x: number, y: number) => number;
}

export function buildSyntheticExr(options: {
  width: number;
  height: number;
  compression: 0 | 2 | 3; // 0=None, 2=ZIPS, 3=ZIP
  channels: readonly SyntheticExrChannel[];
  envmap?: 0 | 1;
}): Uint8Array<ArrayBuffer> {
  const { width, height, compression } = options;
  // OpenEXR requires channels sorted alphabetically by name
  const channels = [...options.channels].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const chunks: Uint8Array[] = [];
  const pushBytes = (arr: Uint8Array | number[]) => chunks.push(arr instanceof Uint8Array ? arr : new Uint8Array(arr));
  const pushCString = (s: string) => pushBytes([...new TextEncoder().encode(s), 0]);
  const pushInt32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    chunks.push(b);
  };
  const pushFloat32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    chunks.push(b);
  };
  const pushAttr = (name: string, type: string, payload: Uint8Array) => {
    pushCString(name);
    pushCString(type);
    pushInt32(payload.byteLength);
    chunks.push(payload);
  };

  // Magic + version 2
  pushBytes([0x76, 0x2f, 0x31, 0x01, 2, 0, 0, 0]);

  // channels attribute
  const chParts: Uint8Array[] = [];
  for (const ch of channels) {
    const nameBytes = new TextEncoder().encode(ch.name);
    const entry = new Uint8Array(nameBytes.length + 1 + 16);
    entry.set(nameBytes, 0);
    const dv = new DataView(entry.buffer);
    const off = nameBytes.length + 1;
    dv.setInt32(off, ch.pixelType, true);
    entry[off + 4] = 0; // pLinear
    dv.setInt32(off + 8, 1, true); // xSampling
    dv.setInt32(off + 12, 1, true); // ySampling
    chParts.push(entry);
  }
  chParts.push(new Uint8Array([0]));
  const chListLen = chParts.reduce((s, p) => s + p.byteLength, 0);
  const chList = new Uint8Array(chListLen);
  let p = 0;
  for (const part of chParts) {
    chList.set(part, p);
    p += part.byteLength;
  }
  pushAttr("channels", "chlist", chList);
  pushAttr("compression", "compression", new Uint8Array([compression]));

  const box = new Uint8Array(16);
  const boxView = new DataView(box.buffer);
  boxView.setInt32(0, 0, true);
  boxView.setInt32(4, 0, true);
  boxView.setInt32(8, width - 1, true);
  boxView.setInt32(12, height - 1, true);
  pushAttr("dataWindow", "box2i", box);
  pushAttr("displayWindow", "box2i", box);
  pushAttr("lineOrder", "lineOrder", new Uint8Array([0]));
  const par = new Uint8Array(4);
  new DataView(par.buffer).setFloat32(0, 1, true);
  pushAttr("pixelAspectRatio", "float", par);
  if (options.envmap !== undefined) {
    pushAttr("envmap", "envmap", new Uint8Array([options.envmap]));
  }
  pushBytes([0]); // end of header

  const headerLen = chunks.reduce((s, c) => s + c.byteLength, 0);
  const linesPerBlock = compression === 3 ? 16 : 1;
  const numChunks = Math.ceil(height / linesPerBlock);
  const offsetTableBytes = numChunks * 8;

  const scanlineChunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let dataCursor = headerLen + offsetTableBytes;

  for (let y0 = 0; y0 < height; y0 += linesPerBlock) {
    const lines = Math.min(linesPerBlock, height - y0);
    const rowBytes = channels.reduce((s, c) => s + width * (c.pixelType === 1 ? 2 : 4), 0);
    const raw = new Uint8Array(lines * rowBytes);
    const rawView = new DataView(raw.buffer);
    let cursor = 0;
    for (let ly = 0; ly < lines; ly++) {
      const y = y0 + ly;
      for (const ch of channels) {
        if (ch.pixelType === 1) {
          for (let x = 0; x < width; x++) {
            rawView.setUint16(cursor, floatToHalf(ch.valueAt(x, y)), true);
            cursor += 2;
          }
        } else {
          for (let x = 0; x < width; x++) {
            rawView.setFloat32(cursor, ch.valueAt(x, y), true);
            cursor += 4;
          }
        }
      }
    }

    let payload: Uint8Array = raw;
    if (compression === 2 || compression === 3) {
      const zipped = zlibSync(exrPredictAndSplit(raw));
      if (zipped.byteLength < raw.byteLength) payload = zipped;
    }

    const chunk = new Uint8Array(8 + payload.byteLength);
    const cv = new DataView(chunk.buffer);
    cv.setInt32(0, y0, true);
    cv.setInt32(4, payload.byteLength, true);
    chunk.set(payload, 8);
    offsets.push(dataCursor);
    dataCursor += chunk.byteLength;
    scanlineChunks.push(chunk);
  }

  const out = new Uint8Array(dataCursor);
  let outPos = 0;
  for (const c of chunks) {
    out.set(c, outPos);
    outPos += c.byteLength;
  }
  const outView = new DataView(out.buffer);
  for (const off of offsets) {
    outView.setUint32(outPos, off >>> 0, true);
    outView.setUint32(outPos + 4, Math.floor(off / 0x100000000), true);
    outPos += 8;
  }
  for (const sc of scanlineChunks) {
    out.set(sc, outPos);
    outPos += sc.byteLength;
  }
  void pushFloat32;
  return out;
}
