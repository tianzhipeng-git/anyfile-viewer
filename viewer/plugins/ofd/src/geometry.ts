import { numbers } from "./xml";

/** Affine matrix `[a, b, c, d, e, f]` (same order as canvas `transform()` and OFD `ST_Array` CTM). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function parseMatrix(value: string | null | undefined): Matrix | undefined {
  const list = numbers(value);
  return list.length === 6 ? (list as unknown as Matrix) : undefined;
}

/** `a` applied first, then `b`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** OFD path command → SVG command and argument count (`C` closes, `B` is the cubic Bézier). */
const COMMANDS: Record<string, readonly [string, number]> = {
  S: ["M", 2],
  M: ["M", 2],
  L: ["L", 2],
  Q: ["Q", 4],
  B: ["C", 6],
  A: ["A", 7],
  C: ["Z", 0],
};

const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Converts OFD `AbbreviatedData` to SVG path data, dropping incomplete trailing segments. */
export function abbreviatedToSvg(data: string): string {
  const out: string[] = [];
  let command: readonly [string, number] | undefined;
  let args: string[] = [];
  const flush = () => {
    if (command && args.length === command[1]) {
      out.push(command[1] ? `${command[0]}${args.join(" ")}` : command[0]);
      args = [];
    }
  };
  for (const token of data.match(TOKEN) ?? []) {
    const next = COMMANDS[token.toUpperCase()];
    if (next) {
      command = next;
      args = [];
      if (!next[1]) flush();
      continue;
    }
    if (!command || !command[1] || /^[A-Za-z]$/.test(token)) continue;
    args.push(token);
    flush();
  }
  // SVG requires a leading move; OFD's current point starts at the object origin.
  if (out.length && !out[0]!.startsWith("M")) out.unshift("M0 0");
  return out.join(" ");
}
