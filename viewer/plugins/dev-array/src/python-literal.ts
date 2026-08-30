import { ViewerError } from "@anyfile/viewer-protocol";

export type PythonValue = string | number | boolean | null | PythonValue[] | { [key: string]: PythonValue };

class Parser {
  private offset = 0;

  constructor(private readonly input: string) {}

  parse(): PythonValue {
    const value = this.value();
    this.space();
    if (this.offset !== this.input.length) this.fail("头部包含多余内容");
    return value;
  }

  private value(): PythonValue {
    this.space();
    const current = this.input[this.offset];
    if (current === "'" || current === '"') return this.string();
    if (current === "{") return this.dictionary();
    if (current === "[") return this.sequence("]");
    if (current === "(") return this.sequence(")");
    const token = this.input.slice(this.offset).match(/^[+-]?[0-9]+/)?.[0];
    if (token) {
      this.offset += token.length;
      const value = Number(token);
      if (!Number.isSafeInteger(value)) this.fail("整数超出安全范围");
      return value;
    }
    for (const [name, value] of [["True", true], ["False", false], ["None", null]] as const) {
      if (this.input.startsWith(name, this.offset)) {
        this.offset += name.length;
        return value;
      }
    }
    return this.fail("头部包含不支持的 Python literal");
  }

  private dictionary(): { [key: string]: PythonValue } {
    const result: { [key: string]: PythonValue } = {};
    this.offset += 1;
    this.space();
    while (this.input[this.offset] !== "}") {
      if (this.offset >= this.input.length) this.fail("字典未闭合");
      const key = this.string();
      this.space();
      if (this.input[this.offset++] !== ":") this.fail("字典缺少冒号");
      result[key] = this.value();
      this.space();
      if (this.input[this.offset] === ",") {
        this.offset += 1;
        this.space();
      } else if (this.input[this.offset] !== "}") this.fail("字典条目缺少逗号");
    }
    this.offset += 1;
    return result;
  }

  private sequence(close: "]" | ")"): PythonValue[] {
    const result: PythonValue[] = [];
    this.offset += 1;
    this.space();
    while (this.input[this.offset] !== close) {
      if (this.offset >= this.input.length) this.fail("序列未闭合");
      result.push(this.value());
      this.space();
      if (this.input[this.offset] === ",") {
        this.offset += 1;
        this.space();
      } else if (this.input[this.offset] !== close) this.fail("序列条目缺少逗号");
    }
    this.offset += 1;
    return result;
  }

  private string(): string {
    const quote = this.input[this.offset++];
    let value = "";
    while (this.offset < this.input.length) {
      const character = this.input[this.offset++];
      if (character === quote) return value;
      if (character !== "\\") {
        value += character;
        continue;
      }
      const escaped = this.input[this.offset++];
      if (escaped === "x") {
        const hex = this.input.slice(this.offset, this.offset + 2);
        if (!/^[0-9a-f]{2}$/i.test(hex)) this.fail("字符串十六进制转义无效");
        value += String.fromCharCode(Number.parseInt(hex, 16));
        this.offset += 2;
      } else {
        value += ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escaped] ?? escaped;
      }
    }
    return this.fail("字符串未闭合");
  }

  private space() {
    while (/\s/.test(this.input[this.offset] ?? "")) this.offset += 1;
  }

  private fail(message: string): never {
    throw new ViewerError("invalid-file", `NPY ${message}。`);
  }
}

export function parsePythonLiteral(input: string): PythonValue {
  return new Parser(input.trim()).parse();
}
