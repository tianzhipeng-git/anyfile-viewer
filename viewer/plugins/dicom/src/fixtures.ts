// Synthetic, non-patient test data. Also used to create manual acceptance samples.
export interface FixtureOptions {
  syntax?: string; pixels?: number[]; bits?: number; stored?: number; highBit?: number;
  signed?: boolean; photometric?: string; samples?: number; planar?: number;
  width?: number; height?: number; frames?: number; slope?: number; intercept?: number;
  center?: number; window?: number; voi?: string; padding?: number; lut?: boolean;
}
export function dicomFixture(options: FixtureOptions = {}) {
  const syntax = options.syntax ?? "1.2.840.10008.1.2.1";
  const little = syntax !== "1.2.840.10008.1.2.2";
  const implicit = syntax === "1.2.840.10008.1.2";
  const bits = options.bits ?? 16;
  const chunks: Uint8Array[] = [];
  const element = (group: number, tag: number, vr: string, value: string | number[] | Uint8Array, meta = false) => {
    const le = meta || little;
    let body: Uint8Array;
    if (typeof value === "string") {
      body = new TextEncoder().encode(value + (value.length % 2 ? (vr === "UI" ? "\0" : " ") : ""));
    } else if (value instanceof Uint8Array) body = value;
    else {
      body = new Uint8Array(value.length * 2);
      value.forEach((v, i) => new DataView(body.buffer).setUint16(i * 2, v, le));
    }
    const long = ["OW", "OB", "SQ"].includes(vr);
    const imp = !meta && implicit;
    const header = new Uint8Array(imp ? 8 : long ? 12 : 8);
    const view = new DataView(header.buffer);
    view.setUint16(0, group, le); view.setUint16(2, tag, le);
    if (imp) view.setUint32(4, body.length, le);
    else {
      header.set(new TextEncoder().encode(vr), 4);
      if (long) view.setUint32(8, body.length, le);
      else view.setUint16(6, body.length, le);
    }
    chunks.push(header, body);
  };
  const prefix = new Uint8Array(132); prefix.set([68, 73, 67, 77], 128); chunks.push(prefix);
  const sop = "1.2.840.10008.5.1.4.1.1.7";
  element(2, 2, "UI", sop, true);
  element(2, 0x10, "UI", syntax, true);
  element(8, 0x16, "UI", sop);
  element(8, 0x20, "DA", "20261004");
  element(8, 0x60, "CS", "OT");
  element(0x28, 2, "US", [options.samples ?? 1]);
  element(0x28, 4, "CS", options.photometric ?? "MONOCHROME2");
  if (options.planar !== undefined) element(0x28, 6, "US", [options.planar]);
  element(0x28, 8, "IS", String(options.frames ?? 1));
  element(0x28, 0x10, "US", [options.height ?? 2]);
  element(0x28, 0x11, "US", [options.width ?? 2]);
  element(0x28, 0x100, "US", [bits]);
  element(0x28, 0x101, "US", [options.stored ?? bits]);
  element(0x28, 0x102, "US", [options.highBit ?? (options.stored ?? bits) - 1]);
  element(0x28, 0x103, "US", [options.signed ? 1 : 0]);
  if (options.padding !== undefined) element(0x28, 0x120, options.signed ? "SS" : "US", [options.padding]);
  if (options.center !== undefined) element(0x28, 0x1050, "DS", String(options.center));
  if (options.window !== undefined) element(0x28, 0x1051, "DS", String(options.window));
  if (options.intercept !== undefined) element(0x28, 0x1052, "DS", String(options.intercept));
  if (options.slope !== undefined) element(0x28, 0x1053, "DS", String(options.slope));
  if (options.voi) element(0x28, 0x1056, "CS", options.voi);
  if (options.lut) element(0x28, 0x3000, "SQ", new Uint8Array());
  const values = options.pixels ?? [0, 100, 200, 300];
  const pixels = bits === 8 ? Uint8Array.from(values) : new Uint8Array(values.length * 2);
  if (bits !== 8) values.forEach((v, i) => new DataView(pixels.buffer).setUint16(i * 2, v, little));
  element(0x7fe0, 0x10, bits === 8 ? "OB" : "OW", pixels);
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; });
  return result;
}
