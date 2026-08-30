import { BinaryCursor, FileByteSource } from "@anyfile/dev-binary-core";
import { ViewerError } from "@anyfile/viewer-protocol";

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 100_000;
const MAX_SECTIONS = 256;
const MAX_STRING_BYTES = 64 * 1024;
const MAX_TOTAL_STRING_BYTES = 8 * 1024 * 1024;
const SECTION_ORDER = new Map([
  [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [13, 6], [6, 7], [7, 8],
  [8, 9], [9, 10], [12, 11], [10, 12], [11, 13],
]);

export type WasmSection = { readonly id: number; readonly name: string; readonly size: number; readonly count?: number };
export type WasmType = { readonly params: readonly string[]; readonly results: readonly string[] };
export type WasmImport = { readonly module: string; readonly name: string; readonly kind: string; readonly detail: string; readonly typeIndex?: number };
export type WasmExport = { readonly name: string; readonly kind: string; readonly index: number };
export type WasmFunction = { readonly typeIndex: number; readonly bodySize: number };
export type WasmModule = {
  readonly version: number;
  readonly sections: readonly WasmSection[];
  readonly types: readonly WasmType[];
  readonly imports: readonly WasmImport[];
  readonly exports: readonly WasmExport[];
  readonly functions: readonly WasmFunction[];
  readonly memories: readonly string[];
  readonly tables: readonly string[];
  readonly customSections: readonly { name: string; size: number }[];
  readonly startFunction?: number;
};

const SECTION_NAMES: Record<number, string> = {
  0: "custom", 1: "type", 2: "import", 3: "function", 4: "table", 5: "memory",
  6: "global", 7: "export", 8: "start", 9: "element", 10: "code", 11: "data",
  12: "data count", 13: "tag",
};
const VALUE_TYPES: Record<number, string> = {
  0x7f: "i32", 0x7e: "i64", 0x7d: "f32", 0x7c: "f64", 0x7b: "v128",
  0x70: "funcref", 0x6f: "externref",
};
const EXTERNAL_KINDS = ["function", "table", "memory", "global", "tag"];

function invalid(message: string): never {
  throw new ViewerError("invalid-file", message);
}

function limit(message: string): never {
  throw new ViewerError("resource-limit", message);
}

function asCount(value: number, label: string) {
  if (value > MAX_ENTRIES) limit(`${label}数量超过浏览器安全上限。`);
  return value;
}

async function valueType(cursor: BinaryCursor) {
  const byte = await cursor.readByte();
  return VALUE_TYPES[byte] ?? invalid(`未知的 WebAssembly 值类型 0x${byte.toString(16)}。`);
}

async function vectorTypes(cursor: BinaryCursor) {
  const count = asCount(await cursor.readULEBNumber(), "值类型");
  const values: string[] = [];
  for (let index = 0; index < count; index += 1) values.push(await valueType(cursor));
  return values;
}

async function readLimits(cursor: BinaryCursor) {
  const flags = await cursor.readULEBNumber();
  if ((flags & ~0x07) !== 0) invalid("WebAssembly limits 标志无效。");
  const is64 = (flags & 0x04) !== 0;
  const minimum = await cursor.readULEB(is64 ? 64 : 32);
  const maximum = (flags & 0x01) !== 0 ? await cursor.readULEB(is64 ? 64 : 32) : undefined;
  if (maximum !== undefined && maximum < minimum) invalid("WebAssembly limits 的最大值小于最小值。");
  if ((flags & 0x02) !== 0 && maximum === undefined) invalid("共享 WebAssembly limits 必须声明最大值。");
  const suffix = `${minimum}${maximum === undefined ? "+" : `–${maximum}`}`;
  return `${is64 ? "64-bit " : ""}${(flags & 0x02) !== 0 ? "shared " : ""}${suffix}`;
}

async function tableType(cursor: BinaryCursor) {
  return `${await valueType(cursor)} ${await readLimits(cursor)}`;
}

async function globalType(cursor: BinaryCursor) {
  const type = await valueType(cursor);
  const mutable = await cursor.readByte();
  if (mutable > 1) invalid("WebAssembly global 可变性标志无效。");
  return `${mutable ? "mutable " : ""}${type}`;
}

class Strings {
  private total = 0;

  async read(cursor: BinaryCursor) {
    const length = await cursor.readULEBNumber();
    if (length > MAX_STRING_BYTES || this.total + length > MAX_TOTAL_STRING_BYTES) {
      limit("WebAssembly 字符串超过浏览器安全上限。");
    }
    this.total += length;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(await cursor.readBytes(length));
    } catch (error) {
      if (error instanceof ViewerError) throw error;
      if (error instanceof RangeError || (error instanceof DOMException && error.name === "AbortError")) throw error;
      invalid("WebAssembly 名称不是有效 UTF-8。");
    }
  }
}

async function parseTypeSection(cursor: BinaryCursor) {
  const count = asCount(await cursor.readULEBNumber(), "类型");
  const types: WasmType[] = [];
  for (let index = 0; index < count; index += 1) {
    if (await cursor.readByte() !== 0x60) invalid("首版查看器只支持标准函数类型。");
    types.push({ params: await vectorTypes(cursor), results: await vectorTypes(cursor) });
  }
  return types;
}

async function parseImports(cursor: BinaryCursor, strings: Strings) {
  const count = asCount(await cursor.readULEBNumber(), "导入");
  const imports: WasmImport[] = [];
  for (let index = 0; index < count; index += 1) {
    const moduleName = await strings.read(cursor);
    const name = await strings.read(cursor);
    const kindIndex = await cursor.readByte();
    const kind = EXTERNAL_KINDS[kindIndex] ?? invalid("WebAssembly 导入类型无效。");
    let detail: string;
    let typeIndex: number | undefined;
    if (kindIndex === 0) {
      typeIndex = await cursor.readULEBNumber();
      detail = `type ${typeIndex}`;
    }
    else if (kindIndex === 1) detail = await tableType(cursor);
    else if (kindIndex === 2) detail = await readLimits(cursor);
    else if (kindIndex === 3) detail = await globalType(cursor);
    else {
      const attribute = await cursor.readULEBNumber();
      if (attribute !== 0) invalid("WebAssembly tag attribute 无效。");
      typeIndex = await cursor.readULEBNumber();
      detail = `type ${typeIndex}`;
    }
    imports.push({ module: moduleName, name, kind, detail, typeIndex });
  }
  return imports;
}

async function parseExports(cursor: BinaryCursor, strings: Strings) {
  const count = asCount(await cursor.readULEBNumber(), "导出");
  const exports: WasmExport[] = [];
  const names = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const name = await strings.read(cursor);
    if (names.has(name)) invalid("WebAssembly 导出名称重复。");
    names.add(name);
    const kind = EXTERNAL_KINDS[await cursor.readByte()] ?? invalid("WebAssembly 导出类型无效。");
    exports.push({ name, kind, index: await cursor.readULEBNumber() });
  }
  return exports;
}

async function parseVectorIndices(cursor: BinaryCursor, label: string) {
  const count = asCount(await cursor.readULEBNumber(), label);
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) values.push(await cursor.readULEBNumber());
  return values;
}

async function parseCode(cursor: BinaryCursor, typeIndices: readonly number[]) {
  const count = asCount(await cursor.readULEBNumber(), "函数体");
  if (count !== typeIndices.length) invalid("函数声明与函数体数量不一致。");
  const functions: WasmFunction[] = [];
  for (let index = 0; index < count; index += 1) {
    const bodySize = await cursor.readULEBNumber();
    cursor.skip(bodySize);
    functions.push({ typeIndex: typeIndices[index], bodySize });
  }
  return functions;
}

function ensureConsumed(cursor: BinaryCursor, name: string) {
  if (cursor.remaining !== 0) invalid(`WebAssembly ${name} section 含有无法识别的数据。`);
}

export async function parseWasm(file: File, signal: AbortSignal): Promise<WasmModule> {
  if (file.size > MAX_FILE_BYTES) limit("WebAssembly 文件超过 512 MiB 安全上限。");
  const source = new FileByteSource(file, signal);
  const cursor = new BinaryCursor(source);
  try {
    const header = await cursor.readBytes(8);
    if (header[0] !== 0x00 || header[1] !== 0x61 || header[2] !== 0x73 || header[3] !== 0x6d) {
      invalid("文件不是 WebAssembly 模块。");
    }
    if (header[4] !== 1 || header[5] !== 0 || header[6] !== 0 || header[7] !== 0) {
      invalid("不支持这个 WebAssembly 二进制版本。");
    }

    const strings = new Strings();
    const sections: WasmSection[] = [];
    const types: WasmType[] = [];
    const imports: WasmImport[] = [];
    const exports: WasmExport[] = [];
    const memories: string[] = [];
    const tables: string[] = [];
    const customSections: { name: string; size: number }[] = [];
    let functionTypes: number[] = [];
    let functions: WasmFunction[] = [];
    let startFunction: number | undefined;
    let globalCount = 0;
    let tagCount = 0;
    let lastOrder = 0;
    const seen = new Set<number>();

    while (cursor.remaining > 0) {
      if (sections.length >= MAX_SECTIONS) limit("WebAssembly section 数量超过安全上限。");
      const id = await cursor.readByte();
      const size = await cursor.readULEBNumber();
      if (!(id in SECTION_NAMES)) invalid(`未知的 WebAssembly section id ${id}。`);
      if (size > cursor.remaining) invalid("WebAssembly section 超出文件末尾。");
      if (id !== 0) {
        const order = SECTION_ORDER.get(id)!;
        if (seen.has(id) || order < lastOrder) invalid("WebAssembly section 重复或顺序无效。");
        seen.add(id);
        lastOrder = order;
      }
      const sectionCursor = new BinaryCursor(source, cursor.position, cursor.position + size);
      let count: number | undefined;
      if (id === 0) {
        const name = await strings.read(sectionCursor);
        customSections.push({ name, size: sectionCursor.remaining });
        sectionCursor.skip(sectionCursor.remaining);
      } else if (id === 1) {
        types.push(...await parseTypeSection(sectionCursor));
        count = types.length;
      } else if (id === 2) {
        imports.push(...await parseImports(sectionCursor, strings));
        count = imports.length;
      } else if (id === 3) {
        functionTypes = await parseVectorIndices(sectionCursor, "函数声明");
        count = functionTypes.length;
      } else if (id === 4) {
        count = asCount(await sectionCursor.readULEBNumber(), "表");
        for (let index = 0; index < count; index += 1) tables.push(await tableType(sectionCursor));
      } else if (id === 5) {
        count = asCount(await sectionCursor.readULEBNumber(), "内存");
        for (let index = 0; index < count; index += 1) memories.push(await readLimits(sectionCursor));
      } else if (id === 7) {
        exports.push(...await parseExports(sectionCursor, strings));
        count = exports.length;
      } else if (id === 8) {
        startFunction = await sectionCursor.readULEBNumber();
      } else if (id === 10) {
        functions = await parseCode(sectionCursor, functionTypes);
        count = functions.length;
      } else if (id === 12) {
        count = await sectionCursor.readULEBNumber();
      } else {
        count = asCount(await sectionCursor.readULEBNumber(), SECTION_NAMES[id]);
        if (id === 6) globalCount = count;
        if (id === 13) tagCount = count;
        sectionCursor.skip(sectionCursor.remaining);
      }
      ensureConsumed(sectionCursor, SECTION_NAMES[id]);
      sections.push({ id, name: SECTION_NAMES[id], size, count });
      cursor.skip(size);
    }
    for (const typeIndex of functionTypes) {
      if (typeIndex >= types.length) invalid("WebAssembly 函数声明引用了无效类型。");
    }
    for (const item of imports) {
      if (item.typeIndex !== undefined && item.typeIndex >= types.length) {
        invalid("WebAssembly 导入引用了无效函数类型。");
      }
    }
    const totals = new Map<string, number>([
      ["function", imports.filter((item) => item.kind === "function").length + functionTypes.length],
      ["table", imports.filter((item) => item.kind === "table").length + tables.length],
      ["memory", imports.filter((item) => item.kind === "memory").length + memories.length],
      ["global", imports.filter((item) => item.kind === "global").length + globalCount],
      ["tag", imports.filter((item) => item.kind === "tag").length + tagCount],
    ]);
    for (const item of exports) {
      if (item.index >= (totals.get(item.kind) ?? 0)) invalid("WebAssembly 导出索引越界。");
    }
    if (startFunction !== undefined && startFunction >= (totals.get("function") ?? 0)) {
      invalid("WebAssembly start function 索引越界。");
    }
    return { version: 1, sections, types, imports, exports, functions, memories, tables, customSections, startFunction };
  } catch (error) {
    if (error instanceof ViewerError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    if (error instanceof RangeError) invalid("WebAssembly 数据已截断或包含无效整数。");
    throw error;
  }
}
