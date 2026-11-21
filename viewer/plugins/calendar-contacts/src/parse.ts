const MAX_LINES = 200_000;
const MAX_VALUE_LENGTH = 32 * 1024;
const MAX_COMPONENT_DEPTH = 8;

export interface ContentLine {
  readonly name: string;
  readonly params: Readonly<Record<string, readonly string[]>>;
  readonly value: string;
}

export interface ContentComponent {
  readonly name: string;
  readonly properties: readonly ContentLine[];
  readonly children: readonly ContentComponent[];
}

interface MutableComponent {
  name: string;
  properties: ContentLine[];
  children: MutableComponent[];
}

export function decodeText(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** RFC 5545 / RFC 6350 line unfolding: indented lines continue the previous logical line. */
export function logicalLines(text: string): string[] {
  const physical = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of physical) {
    if (lines.length > 0 && (line.startsWith(" ") || line.startsWith("\t"))) {
      const index = lines.length - 1;
      lines[index] = `${lines[index]!}${line.slice(1)}`;
    } else if (line.length > 0) {
      lines.push(line);
    }
    if (lines.length > MAX_LINES) break;
  }
  return lines;
}

function splitOutsideQuotes(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const character of text) {
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === separator && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

export function parseContentLine(line: string): ContentLine | undefined {
  let end = -1;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') quoted = !quoted;
    else if (character === ":" && !quoted) {
      end = index;
      break;
    }
  }
  if (end <= 0) return undefined;
  const head = line.slice(0, end);
  const value = line.slice(end + 1, end + 1 + MAX_VALUE_LENGTH);
  const [rawName, ...rawParams] = splitOutsideQuotes(head, ";");
  const name = rawName!.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(name)) return undefined;

  const params: Record<string, string[]> = {};
  const add = (key: string, values: readonly string[]) => {
    params[key] = [...(params[key] ?? []), ...values.filter(Boolean)];
  };
  for (const rawParam of rawParams) {
    const equals = rawParam.indexOf("=");
    if (equals < 0) {
      add("TYPE", [unquote(rawParam)]);
      continue;
    }
    const key = rawParam.slice(0, equals).trim().toUpperCase();
    if (!key) continue;
    add(key, splitOutsideQuotes(rawParam.slice(equals + 1), ",").map(unquote));
  }
  return { name, params, value };
}

function decodeQuotedPrintable(text: string, charset: string | undefined): string {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "=") {
      const hex = text.slice(index + 1, index + 3);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        index += 2;
        continue;
      }
      if (index + 1 >= text.length) continue;
    }
    for (const byte of encoder.encode(character)) bytes.push(byte);
  }
  try {
    return new TextDecoder(charset ?? "utf-8").decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, character: string) => (character === "n" || character === "N" ? "\n" : character));
}

export function splitEscaped(value: string, separator = ";"): string[] {
  const parts: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === "\\" && index + 1 < value.length) {
      current += character + value[index + 1];
      index += 1;
      continue;
    }
    if (character === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

/** Text value for display: quoted-printable and Base64 payloads are decoded once. */
export function decodeValue(line: ContentLine): string {
  const encoding = line.params.ENCODING?.[0]?.toUpperCase();
  if (encoding === "QUOTED-PRINTABLE") return unescapeText(decodeQuotedPrintable(line.value, line.params.CHARSET?.[0]));
  return unescapeText(line.value);
}

export function isBase64Encoded(line: ContentLine): boolean {
  const encoding = line.params.ENCODING?.[0]?.toUpperCase();
  return encoding === "B" || encoding === "BASE64" || line.params.VALUE?.[0]?.toLowerCase() === "binary";
}

export function parseComponentTree(lines: readonly string[]): ContentComponent {
  const root: MutableComponent = { name: "", properties: [], children: [] };
  const stack: MutableComponent[] = [root];
  for (const line of lines) {
    const parsed = parseContentLine(line);
    if (!parsed) continue;
    if (parsed.name === "BEGIN") {
      const component: MutableComponent = { name: parsed.value.trim().toUpperCase(), properties: [], children: [] };
      if (stack.length <= MAX_COMPONENT_DEPTH) {
        stack[stack.length - 1]!.children.push(component);
        stack.push(component);
      }
      continue;
    }
    if (parsed.name === "END") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    stack[stack.length - 1]!.properties.push(parsed);
  }
  return root;
}

export function propertiesOf(component: ContentComponent, name: string): ContentLine[] {
  return component.properties.filter((line) => line.name === name);
}

export function propertyOf(component: ContentComponent, ...names: string[]): ContentLine | undefined {
  for (const name of names) {
    const found = component.properties.find((line) => line.name === name);
    if (found) return found;
  }
  return undefined;
}

export function textOf(component: ContentComponent, name: string): string | undefined {
  const line = propertiesOf(component, name)[0];
  if (!line) return undefined;
  const value = decodeValue(line).trim();
  return value || undefined;
}
