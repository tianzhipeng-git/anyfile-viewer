export class ProbeReader {
  #bytes = 0;
  #reads = 0;
  constructor(readonly file: File, readonly signal: AbortSignal) {}
  async read(offset: number, length: number) {
    this.signal.throwIfAborted();
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.file.size || (this.#bytes += length) > 512 * 1024 || ++this.#reads > 4096) throw new Error("Probe bounds");
    const buffer = await this.file.slice(offset, offset + length).arrayBuffer();
    this.signal.throwIfAborted();
    if (buffer.byteLength !== length) throw new Error("Truncated read");
    return new DataView(buffer);
  }
}
export function fourCC(data: DataView, offset = 0) {
  return String.fromCharCode(...new Uint8Array(data.buffer, data.byteOffset + offset, 4));
}
