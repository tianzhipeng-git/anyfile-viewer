import { ViewerError } from "@anyfile/viewer-protocol";
import { CHM_LIMITS } from "./limits";

export const LZX_FRAME_SIZE = 32768;
const LZX_MAX_CODE_LEN = 16;
const LZX_TABLE_BITS = 12;
const LZX_PRETREE_SIZE = 20;
const LZX_LENGTH_TREE_SIZE = 249;
const LZX_ALIGNED_SIZE = 8;

const POSITION_SLOTS = [30, 32, 34, 36, 38, 42, 50] as const;

const EXTRA_BITS = new Uint8Array(51);
const POSITION_BASE = new Uint32Array(51);
(() => {
  let base = 0;
  for (let i = 0; i < 51; i += 1) {
    const extra = i < 4 ? 0 : i < 36 ? (i >> 1) - 1 : 17;
    EXTRA_BITS[i] = extra;
    POSITION_BASE[i] = base;
    base += 1 << extra;
  }
})();

export interface ControlData {
  readonly windowBits: number;
  readonly windowSize: number;
  readonly resetInterval: number;
  readonly resetFrames: number;
}

class LzxBitReader {
  private pos = 0;
  private bitBuf = 0;
  private bitsLeft = 0;
  private eofPadded = false;

  constructor(private readonly data: Uint8Array) {}

  ensure(n: number): void {
    while (this.bitsLeft < n) {
      if (this.pos >= this.data.length) {
        if (this.eofPadded) {
          throw new ViewerError("invalid-file", "Unexpected end of LZX compressed stream.");
        }
        // LZX Huffman table lookups peek up to 12 bits; allow one trailing 16-bit zero pad at EOF.
        this.eofPadded = true;
        this.bitsLeft += 16;
        return;
      }
      const lo = this.data[this.pos++];
      const hi = this.pos < this.data.length ? this.data[this.pos++] : 0;
      const word = lo | (hi << 8);
      this.bitBuf = (this.bitBuf | (word << (16 - this.bitsLeft))) >>> 0;
      this.bitsLeft += 16;
    }
  }

  peek(n: number): number {
    if (n === 0) return 0;
    this.ensure(n);
    return this.bitBuf >>> (32 - n);
  }

  skip(n: number): void {
    if (this.eofPadded && n > this.bitsLeft - 16) {
      throw new ViewerError("invalid-file", "Unexpected end of LZX compressed stream.");
    }
    this.bitBuf = n >= 32 ? 0 : (this.bitBuf << n) >>> 0;
    this.bitsLeft -= n;
  }

  readBits(n: number): number {
    if (n === 0) return 0;
    if (n <= 16) {
      const value = this.peek(n);
      this.skip(n);
      return value;
    }
    const high = this.readBits(16);
    const low = this.readBits(n - 16);
    return ((high << (n - 16)) | low) >>> 0;
  }

  alignForUncompressed(): { r0: number; r1: number; r2: number } {
    if (this.bitsLeft === 0) {
      this.ensure(16);
    }
    this.bitsLeft = 0;
    this.bitBuf = 0;
    const r0 = this.readRawUint32();
    const r1 = this.readRawUint32();
    const r2 = this.readRawUint32();
    return { r0, r1, r2 };
  }

  readRawBytes(dest: Uint8Array, destOffset: number, count: number): void {
    if (this.pos + count > this.data.length) {
      throw new ViewerError("invalid-file", "Truncated LZX uncompressed block.");
    }
    dest.set(this.data.subarray(this.pos, this.pos + count), destOffset);
    this.pos += count;
  }

  skipPadByte(): void {
    if (this.pos < this.data.length) {
      this.pos += 1;
    }
  }

  private readRawUint32(): number {
    if (this.pos + 4 > this.data.length) {
      throw new ViewerError("invalid-file", "Truncated LZX uncompressed block header.");
    }
    const v =
      (this.data[this.pos] |
        (this.data[this.pos + 1] << 8) |
        (this.data[this.pos + 2] << 16) |
        (this.data[this.pos + 3] << 24)) >>>
      0;
    this.pos += 4;
    return v;
  }
}

interface HuffmanTable {
  readonly empty: boolean;
  readonly maxBits: number;
  readonly table: Int32Array;
  readonly left: Int32Array;
  readonly right: Int32Array;
}

function buildCanonicalTree(lengths: Uint8Array, allowEmpty: boolean): HuffmanTable {
  const numSyms = lengths.length;
  const tableSize = 1 << LZX_TABLE_BITS;
  const table = new Int32Array(tableSize).fill(-1);
  const left = new Int32Array(numSyms * 2 + 16).fill(-1);
  const right = new Int32Array(numSyms * 2 + 16).fill(-1);

  let nonZero = 0;
  let maxLen = 0;
  for (let i = 0; i < numSyms; i += 1) {
    const len = lengths[i];
    if (len > LZX_MAX_CODE_LEN) {
      throw new ViewerError("invalid-file", "Invalid LZX Huffman code length.");
    }
    if (len > 0) {
      nonZero += 1;
      if (len > maxLen) maxLen = len;
    }
  }
  if (nonZero === 0) {
    if (!allowEmpty) {
      throw new ViewerError("invalid-file", "Empty LZX Huffman table.");
    }
    return { empty: true, maxBits: 0, table, left, right };
  }

  let code = 0;
  let nextNode = numSyms;

  for (let bits = 1; bits <= maxLen; bits += 1) {
    for (let sym = 0; sym < numSyms; sym += 1) {
      if (lengths[sym] !== bits) continue;
      if (code >= 1 << bits) {
        throw new ViewerError("invalid-file", "Oversubscribed LZX Huffman table.");
      }
      if (bits <= LZX_TABLE_BITS) {
        const shift = LZX_TABLE_BITS - bits;
        const start = code << shift;
        const end = (code + 1) << shift;
        table.fill(sym, start, end);
      } else {
        const prefix = code >>> (bits - LZX_TABLE_BITS);
        let node = table[prefix];
        if (node === -1) {
          node = nextNode++;
          table[prefix] = node;
        }
        const extra = bits - LZX_TABLE_BITS;
        for (let step = extra - 1; step >= 0; step -= 1) {
          const bit = (code >>> step) & 1;
          if (step === 0) {
            if (bit) right[node] = sym;
            else left[node] = sym;
          } else {
            let child = bit ? right[node] : left[node];
            if (child === -1) {
              child = nextNode++;
              if (bit) right[node] = child;
              else left[node] = child;
            }
            node = child;
          }
        }
      }
      code += 1;
    }
    code <<= 1;
  }

  return { empty: false, maxBits: maxLen, table, left, right };
}

function decodeSymbol(reader: LzxBitReader, tree: HuffmanTable, lengths: Uint8Array, numSyms: number): number {
  if (tree.empty) {
    throw new ViewerError("invalid-file", "Attempted decode from empty LZX Huffman table.");
  }
  const peek12 = reader.peek(LZX_TABLE_BITS);
  const sym = tree.table[peek12];
  if (sym < 0) {
    throw new ViewerError("invalid-file", "Invalid LZX Huffman prefix.");
  }
  if (sym < numSyms) {
    reader.skip(lengths[sym]);
    return sym;
  }
  reader.skip(LZX_TABLE_BITS);
  let node = sym;
  for (let depth = 0; depth < LZX_MAX_CODE_LEN - LZX_TABLE_BITS + 1; depth += 1) {
    const bit = reader.readBits(1);
    node = bit ? tree.right[node] : tree.left[node];
    if (node < 0) {
      throw new ViewerError("invalid-file", "Invalid LZX Huffman tree path.");
    }
    if (node < numSyms) return node;
  }
  throw new ViewerError("invalid-file", "LZX Huffman code exceeded max length.");
}

function readLengths(reader: LzxBitReader, lengths: Uint8Array, first: number, last: number): void {
  const preLengths = new Uint8Array(LZX_PRETREE_SIZE);
  for (let i = 0; i < LZX_PRETREE_SIZE; i += 1) {
    preLengths[i] = reader.readBits(4);
  }
  const preTree = buildCanonicalTree(preLengths, false);

  let x = first;
  while (x < last) {
    const y = decodeSymbol(reader, preTree, preLengths, LZX_PRETREE_SIZE);
    if (y === 17) {
      const z = reader.readBits(4) + 4;
      const end = Math.min(last, x + z);
      while (x < end) lengths[x++] = 0;
    } else if (y === 18) {
      const z = reader.readBits(5) + 20;
      const end = Math.min(last, x + z);
      while (x < end) lengths[x++] = 0;
    } else if (y === 19) {
      const z = reader.readBits(1) + 4;
      const sym = decodeSymbol(reader, preTree, preLengths, LZX_PRETREE_SIZE);
      const same = (lengths[x] - sym + 17) % 17;
      const end = Math.min(last, x + z);
      while (x < end) lengths[x++] = same;
    } else {
      lengths[x] = (lengths[x] - y + 17) % 17;
      x += 1;
    }
  }
}

export function decompressLzxStream(
  compressed: Uint8Array,
  control: ControlData,
  outputBytes: number,
  signal: AbortSignal,
): Uint8Array {
  if (outputBytes > CHM_LIMITS.maxResetIntervalBytes && outputBytes > CHM_LIMITS.maxSectionBytes) {
    throw new ViewerError("resource-limit", "LZX decompression request exceeds budget.");
  }
  if (outputBytes === 0) return new Uint8Array(0);
  const reader = new LzxBitReader(compressed);
  const window = new Uint8Array(control.windowSize);
  const windowMask = control.windowSize - 1;
  const paddedOutputBytes = Math.ceil(outputBytes / LZX_FRAME_SIZE) * LZX_FRAME_SIZE;
  const output = new Uint8Array(paddedOutputBytes);

  const posnSlots = POSITION_SLOTS[control.windowBits - 15];
  const mainTreeSize = 256 + (posnSlots << 3);

  const mainLengths = new Uint8Array(mainTreeSize);
  const lengthLengths = new Uint8Array(LZX_LENGTH_TREE_SIZE);
  const alignedLengths = new Uint8Array(LZX_ALIGNED_SIZE);

  let mainTree: HuffmanTable | null = null;
  let lengthTree: HuffmanTable | null = null;
  let alignedTree: HuffmanTable | null = null;

  let r0 = 1;
  let r1 = 1;
  let r2 = 1;
  let headerRead = false;
  let intelFilesize = 0;
  let intelStarted = false;
  let blockType = 0;
  let blockLength = 0;
  let blockRemaining = 0;
  let windowPos = 0;
  let framePos = 0;
  let frame = 0;
  let outPos = 0;

  const resetState = () => {
    r0 = 1;
    r1 = 1;
    r2 = 1;
    headerRead = false;
    blockRemaining = 0;
    blockType = 0;
    mainLengths.fill(0);
    lengthLengths.fill(0);
    mainTree = null;
    lengthTree = null;
    alignedTree = null;
  };

  while (outPos < outputBytes) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    if (control.resetFrames > 0 && frame > 0 && frame % control.resetFrames === 0) {
      resetState();
    }

    if (!headerRead) {
      const hasIntel = reader.readBits(1);
      intelFilesize = hasIntel ? (reader.readBits(16) << 16) | reader.readBits(16) : 0;
      headerRead = true;
    }

    const frameSize = LZX_FRAME_SIZE;
    let bytesTodo = frameSize;

    while (bytesTodo > 0) {
      if (blockRemaining === 0) {
        if (outPos + (frameSize - bytesTodo) >= outputBytes) {
          const partial = frameSize - bytesTodo;
          if (partial > 0) {
            output.set(window.subarray(framePos, framePos + partial), outPos);
          }
          return output.subarray(0, outputBytes);
        }
        if (blockType === 3 && (blockLength & 1) !== 0) {
          reader.skipPadByte();
        }
        blockType = reader.readBits(3);
        blockLength = (reader.readBits(16) << 8) | reader.readBits(8);
        blockRemaining = blockLength;

        if (blockType === 2) {
          for (let i = 0; i < 8; i += 1) alignedLengths[i] = reader.readBits(3);
          alignedTree = buildCanonicalTree(alignedLengths, false);
        }
        if (blockType === 1 || blockType === 2) {
          readLengths(reader, mainLengths, 0, 256);
          readLengths(reader, mainLengths, 256, mainTreeSize);
          mainTree = buildCanonicalTree(mainLengths, false);
          if (mainLengths[0xe8] !== 0) intelStarted = true;
          readLengths(reader, lengthLengths, 0, LZX_LENGTH_TREE_SIZE);
          lengthTree = buildCanonicalTree(lengthLengths, true);
        } else if (blockType === 3) {
          intelStarted = true;
          const regs = reader.alignForUncompressed();
          r0 = regs.r0;
          r1 = regs.r1;
          r2 = regs.r2;
        } else {
          throw new ViewerError("invalid-file", "Invalid LZX block type.");
        }
      }

      const thisRun = Math.min(blockRemaining, bytesTodo);
      if (thisRun <= 0) {
        throw new ViewerError("invalid-file", "Zero-length LZX block.");
      }

      if (blockType === 3) {
        reader.readRawBytes(window, windowPos, thisRun);
        windowPos += thisRun;
        blockRemaining -= thisRun;
        bytesTodo -= thisRun;
      } else {
        let remaining = thisRun;
        while (remaining > 0) {
          const sym = decodeSymbol(reader, mainTree!, mainLengths, mainTreeSize);
          if (sym < 256) {
            window[windowPos++] = sym;
            remaining -= 1;
            blockRemaining -= 1;
            bytesTodo -= 1;
          } else {
            const elem = sym - 256;
            let matchLen = elem & 7;
            if (matchLen === 7) {
              matchLen += decodeSymbol(reader, lengthTree!, lengthLengths, LZX_LENGTH_TREE_SIZE);
            }
            matchLen += 2;
            const footer = elem >> 3;
            let matchOffset: number;
            if (footer === 0) {
              matchOffset = r0;
            } else if (footer === 1) {
              matchOffset = r1;
              r1 = r0;
              r0 = matchOffset;
            } else if (footer === 2) {
              matchOffset = r2;
              r2 = r0;
              r0 = matchOffset;
            } else {
              const extra = EXTRA_BITS[footer];
              const base = POSITION_BASE[footer] - 2;
              if (blockType === 2 && extra >= 3) {
                const verbatimBits = reader.readBits(extra - 3) << 3;
                const alignedBits = decodeSymbol(reader, alignedTree!, alignedLengths, LZX_ALIGNED_SIZE);
                matchOffset = base + verbatimBits + alignedBits;
              } else {
                matchOffset = base + reader.readBits(extra);
              }
              r2 = r1;
              r1 = r0;
              r0 = matchOffset;
            }

            if (matchOffset <= 0 || matchOffset > control.windowSize) {
              throw new ViewerError("invalid-file", "LZX match offset out of window.");
            }
            if (matchLen > remaining) {
              throw new ViewerError("invalid-file", "LZX match crosses block or frame boundary.");
            }

            let srcPos = (windowPos - matchOffset) & windowMask;
            for (let k = 0; k < matchLen; k += 1) {
              window[windowPos++] = window[srcPos];
              srcPos = (srcPos + 1) & windowMask;
            }
            remaining -= matchLen;
            blockRemaining -= matchLen;
            bytesTodo -= matchLen;
          }
        }
      }
    }

    const frameSlice = window.subarray(framePos, framePos + frameSize);
    output.set(frameSlice, outPos);

    if (intelStarted && intelFilesize > 0 && frame < 32768 && frameSize > 10) {
      let curPos = outPos;
      const limit = outPos + frameSize - 10;
      let i = outPos;
      while (i < limit) {
        if (output[i++] !== 0xe8) {
          curPos += 1;
          continue;
        }
        const absOff =
          output[i] |
          (output[i + 1] << 8) |
          (output[i + 2] << 16) |
          (output[i + 3] << 24);
        if (absOff >= -curPos && absOff < intelFilesize) {
          const relOff = absOff >= 0 ? absOff - curPos : absOff + intelFilesize;
          output[i] = relOff & 0xff;
          output[i + 1] = (relOff >>> 8) & 0xff;
          output[i + 2] = (relOff >>> 16) & 0xff;
          output[i + 3] = (relOff >>> 24) & 0xff;
        }
        i += 4;
        curPos += 5;
      }
    }

    outPos += frameSize;
    framePos += frameSize;
    frame += 1;
    if (windowPos === control.windowSize) windowPos = 0;
    if (framePos === control.windowSize) framePos = 0;
  }

  return output.subarray(0, outputBytes);
}
