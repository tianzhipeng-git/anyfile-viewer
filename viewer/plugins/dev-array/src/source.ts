import { ViewerError } from "@anyfile/viewer-protocol";
import { readFileRange } from "@anyfile/dev-binary-core";

export interface ArrayByteSource {
  readonly size: number;
  read(start: number, length: number): Promise<Uint8Array>;
  dispose?(): void | Promise<void>;
}

export class FileByteSource implements ArrayByteSource {
  readonly size: number;

  constructor(private readonly file: File, private readonly signal: AbortSignal) {
    this.size = file.size;
  }

  async read(start: number, length: number): Promise<Uint8Array> {
    try {
      return await readFileRange(this.file, this.signal, start, length);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ViewerError("invalid-file", "数组数据范围超出文件末尾。");
    }
  }
}
