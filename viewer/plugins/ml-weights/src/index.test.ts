import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateManifest, type Locale } from "@anyfile/viewer-protocol";
import { assertReadsWithin, createTrackedFile, createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { mlWeightsViewer } from "./index";
import { mlWeightsManifest } from "./manifest";
import { MAX_GGUF_STRUCT_BYTES, parseGgufStruct } from "./gguf";
import { readModel } from "./parse";
import { MAX_SAFETENSORS_HEADER_BYTES } from "./safetensors";
import { createModelView } from "./ui";

const HERE = dirname(fileURLToPath(import.meta.url));
const GGUF_SAMPLE = new Uint8Array(readFileSync(join(HERE, "../examples/stories260K.gguf")));
const SAFETENSORS_SAMPLE = new Uint8Array(readFileSync(join(HERE, "../examples/tiny-random-bert.safetensors")));

const contexts: ViewerTestContext[] = [];

function contextFor(contents: Uint8Array, name: string, locale: Locale = "zh-CN") {
  const test = createViewerTestContext(new File([contents.slice().buffer as ArrayBuffer], name));
  contexts.push(test);
  return { ...test, context: { ...test.context, locale } };
}

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

function buildSyntheticGguf(options: { version?: number; metadataPaddingBytes?: number; tensorPayloadBytes?: number } = {}) {
  const version = options.version ?? 3;
  const padding = options.metadataPaddingBytes ?? 0;
  const tensorPayload = options.tensorPayloadBytes ?? 64;
  const enc = new TextEncoder();
  const key = enc.encode("general.description");
  const value = new Uint8Array(padding).fill(0x61);
  const tensorName = enc.encode("w");

  // header (24) + kv (8 + key + 4 + 8 + value) + tensor (8 + name + 4 + 8 + 4 + 8)
  const headerLen = 24 + (8 + key.length + 4 + 8 + value.length) + (8 + tensorName.length + 4 + 8 + 4 + 8);
  const alignedDataStart = headerLen + ((32 - (headerLen % 32)) % 32);
  const bytes = new Uint8Array(alignedDataStart + tensorPayload);
  const view = new DataView(bytes.buffer);
  let pos = 0;
  const writeU32 = (v: number) => { view.setUint32(pos, v, true); pos += 4; };
  const writeU64 = (v: number) => { view.setBigUint64(pos, BigInt(v), true); pos += 8; };
  const writeStr = (s: Uint8Array) => { writeU64(s.length); bytes.set(s, pos); pos += s.length; };

  bytes.set(enc.encode("GGUF"), 0);
  pos = 4;
  writeU32(version);
  writeU64(1); // tensorCount
  writeU64(1); // metadataCount
  writeStr(key);
  writeU32(8); // T_STRING
  writeStr(value);
  writeStr(tensorName);
  writeU32(1); // ndims
  writeU64(16); // shape [16]
  writeU32(0); // F32 (64 bytes)
  writeU64(0); // offset relative to tensorDataStart

  return bytes;
}

describe("ml-weights parser", () => {
  it("derives tensor list and metadata from a real GGUF file", async () => {
    const doc = await readModel(new File([GGUF_SAMPLE.slice().buffer as ArrayBuffer], "stories260K.gguf"), new AbortController().signal, () => {});
    expect(doc.format).toBe("gguf");
    expect(doc.version).toBe("GGUF v3");
    expect(doc.architecture).toBe("llama");
    expect(doc.tensorCount).toBe(48);
    expect(doc.tensors[0]).toMatchObject({ name: "token_embd.weight", dtype: "F32", shape: [64, 512] });
    expect(doc.totalParameters).toBeGreaterThan(0);
    expect(doc.metadata.some((entry) => entry.key === "llama.block_count" && entry.value === "5")).toBe(true);
  });

  it("derives tensor list and metadata from a real safetensors file", async () => {
    const doc = await readModel(new File([SAFETENSORS_SAMPLE.slice().buffer as ArrayBuffer], "model.safetensors"), new AbortController().signal, () => {});
    expect(doc.format).toBe("safetensors");
    expect(doc.tensorCount).toBe(100);
    const embedding = doc.tensors.find((tensor) => tensor.name === "bert.embeddings.word_embeddings.weight");
    expect(embedding).toMatchObject({ dtype: "F32", shape: [1124, 32] });
    expect(doc.metadata.some((entry) => entry.key === "format" && entry.value === "pt")).toBe(true);
  });

  it("rejects truncated and non-model input", async () => {
    const signal = new AbortController().signal;
    await expect(readModel(new File([GGUF_SAMPLE.slice(0, 12).buffer as ArrayBuffer], "broken.gguf"), signal, () => {}))
      .rejects.toMatchObject({ code: "invalid-file" });
    // Corrupt GGUF version field makes the header invalid.
    const badVersion = GGUF_SAMPLE.slice(0, 64);
    new DataView(badVersion.buffer).setUint32(4, 99, true);
    await expect(readModel(new File([badVersion.buffer as ArrayBuffer], "bad.gguf"), signal, () => {}))
      .rejects.toMatchObject({ code: "invalid-file" });
    // Non-JSON after a plausible safetensors header length.
    const fakeHeader = new Uint8Array(9);
    new DataView(fakeHeader.buffer).setBigUint64(0, BigInt(1), true);
    fakeHeader[8] = 0x21; // '!'
    await expect(readModel(new File([fakeHeader.buffer as ArrayBuffer], "fake.safetensors"), signal, () => {}))
      .rejects.toMatchObject({ code: "invalid-file" });
  });

  it("enforces the file-size bound for tensor data", async () => {
    const view = new DataView(GGUF_SAMPLE.buffer, GGUF_SAMPLE.byteOffset, GGUF_SAMPLE.length);
    expect(parseGgufStruct(view, true, GGUF_SAMPLE.length).tensorCount).toBe(48);
    // Claiming the tensor data extends past the file must be rejected.
    expect(() => parseGgufStruct(view, true, 1000)).toThrow();

    // Safetensors file truncated after a valid header must be rejected when offsets exceed payload size.
    const headerJson = new TextEncoder().encode(JSON.stringify({
      weight: { dtype: "F32", shape: [4], data_offsets: [0, 16] },
    }));
    const truncatedSt = new Uint8Array(8 + headerJson.length + 15); // 1 byte short of 16-byte payload
    new DataView(truncatedSt.buffer).setBigUint64(0, BigInt(headerJson.length), true);
    truncatedSt.set(headerJson, 8);
    await expect(readModel(new File([truncatedSt.buffer as ArrayBuffer], "truncated.safetensors"), new AbortController().signal, () => {}, "en"))
      .rejects.toMatchObject({ code: "invalid-file", message: expect.stringContaining("invalid data offsets") });
  });

  it("accepts valid GGUF files whose metadata is larger than tensor data", () => {
    const bytes = buildSyntheticGguf({ metadataPaddingBytes: 2048, tensorPayloadBytes: 64 });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const doc = parseGgufStruct(view, true, bytes.length, "en");
    expect(doc.tensorCount).toBe(1);
    expect(doc.tensors[0]).toMatchObject({ name: "w", dtype: "F32", bytes: 64 });
  });

  it("rejects GGUF v1 files with localized invalid-file error", async () => {
    const v1 = buildSyntheticGguf({ version: 1 });
    await expect(readModel(new File([v1.slice().buffer as ArrayBuffer], "old.gguf"), new AbortController().signal, () => {}, "en"))
      .rejects.toMatchObject({ code: "invalid-file", message: expect.stringContaining("Unsupported GGUF version 1") });
  });

  it("reads multi-GB GGUF headers incrementally without eagerly slicing 200 MiB", async () => {
    const reads: Array<{ start: number; end: number }> = [];
    const hugeSize = 4 * 1024 * 1024 * 1024; // 4 GiB simulated file
    const fakeFile = {
      name: "huge.gguf",
      size: hugeSize,
      slice(start = 0, end = hugeSize) {
        reads.push({ start, end });
        const sliceEnd = Math.min(end, GGUF_SAMPLE.length);
        return new Blob([GGUF_SAMPLE.slice(start, sliceEnd)]);
      },
    } as unknown as File;

    const doc = await readModel(fakeFile, new AbortController().signal, () => {}, "en");
    expect(doc.tensorCount).toBe(48);
    expect(Math.max(...reads.map((read) => read.end))).toBeLessThanOrEqual(1024 * 1024);
  });

  it("throws resource-limit for oversized safetensors and GGUF headers", async () => {
    const stHead = new Uint8Array(8);
    new DataView(stHead.buffer).setBigUint64(0, BigInt(MAX_SAFETENSORS_HEADER_BYTES + 16), true);
    const oversizedSt = {
      name: "huge-header.safetensors",
      size: MAX_SAFETENSORS_HEADER_BYTES + 1024,
      slice(start = 0, end = 8) {
        return new Blob([stHead.slice(start, Math.min(end, stHead.length))]);
      },
    } as unknown as File;
    await expect(readModel(oversizedSt, new AbortController().signal, () => {}, "en"))
      .rejects.toMatchObject({ code: "resource-limit", message: expect.stringContaining("100 MiB") });

    // GGUF claiming a metadata string larger than MAX_GGUF_STRUCT_BYTES inside an even larger file
    const ggufHead = new Uint8Array(40);
    const dv = new DataView(ggufHead.buffer);
    ggufHead.set(new TextEncoder().encode("GGUF"), 0);
    dv.setUint32(4, 3, true); // v3
    dv.setBigUint64(8, BigInt(1), true); // tensorCount
    dv.setBigUint64(16, BigInt(1), true); // metadataCount
    dv.setBigUint64(24, BigInt(MAX_GGUF_STRUCT_BYTES + 64), true); // huge key length
    const oversizedGguf = {
      name: "huge-meta.gguf",
      size: MAX_GGUF_STRUCT_BYTES + 4096,
      slice(start = 0, end = 40) {
        const clamped = Math.min(end, ggufHead.length);
        return new Blob([ggufHead.slice(start, clamped)]);
      },
    } as unknown as File;
    await expect(readModel(oversizedGguf, new AbortController().signal, () => {}, "en"))
      .rejects.toMatchObject({ code: "resource-limit", message: expect.stringContaining("200 MiB") });
  });
});

describe("ml-weights probe", () => {
  it("returns support 3 for real GGUF and safetensors with bounded reads", async () => {
    const { probeMlWeights } = await import("./probe");
    const ggufTracked = createTrackedFile(GGUF_SAMPLE, "a.gguf");
    expect(await probeMlWeights({ file: ggufTracked.file, signal: new AbortController().signal })).toBe(3);
    assertReadsWithin(ggufTracked.reads, [{ start: 0, end: 9 }]);

    const stTracked = createTrackedFile(SAFETENSORS_SAMPLE, "a.safetensors");
    expect(await probeMlWeights({ file: stTracked.file, signal: new AbortController().signal })).toBe(3);
    assertReadsWithin(stTracked.reads, [{ start: 0, end: 9 }]);
  });

  it("returns 0 for unrelated bytes", async () => {
    const { probeMlWeights } = await import("./probe");
    const data = new TextEncoder().encode("plain text, not a model file at all");
    expect(await probeMlWeights({ file: new File([data.buffer as ArrayBuffer], "a.bin"), signal: new AbortController().signal })).toBe(0);
  });
});

describe("ml-weights viewer", () => {
  it("publishes a valid manifest", () => {
    expect(() => validateManifest(mlWeightsManifest)).not.toThrow();
    expect(mlWeightsManifest.formats.flatMap((format) => format.extensions)).toEqual([".safetensors", ".gguf"]);
  });

  it("renders overview and tensor list from the real GGUF sample", async () => {
    const test = contextFor(GGUF_SAMPLE, "stories260K.gguf");
    const reportPreview = vi.fn();
    const controller = await mlWeightsViewer.open({ ...test.context, reportPreview });

    expect(test.container.textContent).toContain("GGUF v3");
    expect(test.container.textContent).toContain("token_embd.weight");
    expect(test.container.textContent).toContain("llama.block_count");
    expect(test.container.querySelectorAll(".anyfile-ml-weights-viewer__table tbody tr").length).toBeGreaterThan(5);
    expect(test.progress.at(-1)?.stage).toBe("ready");
    expect(reportPreview).toHaveBeenCalledExactlyOnceWith({ outcome: "success", kind: "structure" });

    const filter = test.container.querySelector<HTMLInputElement>("[data-ml-weights-filter]")!;
    filter.value = "output";
    filter.dispatchEvent(new Event("input"));
    expect(test.container.textContent).toContain("output.weight");
    expect(test.container.textContent).not.toContain("token_embd.weight");

    await controller.dispose();
    await controller.dispose();
    expect(test.container.childElementCount).toBe(0);
    expect(test.outside.dataset.viewerTestOutside).toBe("untouched");
  });

  it("sorts the Size column by byte size rather than element count", () => {
    const view = createModelView({
      format: "safetensors",
      name: "mixed.safetensors",
      version: "Safetensors",
      tensorCount: 2,
      totalParameters: 10,
      totalBytes: 20,
      metadata: [],
      tensors: [
        { name: "many_small_elems", shape: [8], dtype: "U8", bytes: 8 },
        { name: "fewer_wide_elems", shape: [3], dtype: "F32", bytes: 12 },
      ],
    }, "en");
    document.body.append(view.root);
    try {
      const sortBtn = view.root.querySelector<HTMLButtonElement>(".anyfile-inspector__sort-btn")!;
      sortBtn.click(); // initialSort: desc -> 12 B first
      const descNames = [...view.root.querySelectorAll(".anyfile-ml-weights-viewer__table tbody tr td:first-child")]
        .map((cell) => cell.textContent);
      expect(descNames).toEqual(["fewer_wide_elems", "many_small_elems"]);

      sortBtn.click(); // asc -> 8 B first
      const ascNames = [...view.root.querySelectorAll(".anyfile-ml-weights-viewer__table tbody tr td:first-child")]
        .map((cell) => cell.textContent);
      expect(ascNames).toEqual(["many_small_elems", "fewer_wide_elems"]);
    } finally {
      view.dispose();
    }
  });

  it("disposes an active view when aborted after opening", async () => {
    const test = contextFor(GGUF_SAMPLE, "stories260K.gguf");
    await mlWeightsViewer.open(test.context);
    expect(test.container.childElementCount).toBe(1);
    test.abortController.abort();
    expect(test.container.childElementCount).toBe(0);
  });

  it("renders tensor list from the real safetensors sample", async () => {
    const test = contextFor(SAFETENSORS_SAMPLE, "model.safetensors", "en");
    const controller = await mlWeightsViewer.open(test.context);
    expect(test.container.textContent).toContain("bert.embeddings.word_embeddings.weight");
    expect(test.container.textContent).toContain("Tensors");
    await controller.dispose();
  });

  it("rejects an invalid file through open() with localized messages", async () => {
    const zh = contextFor(new TextEncoder().encode("not a model"), "bad.gguf", "zh-CN");
    await expect(mlWeightsViewer.open(zh.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: expect.stringContaining("Safetensors"),
    });
    expect(zh.container.childElementCount).toBe(0);

    const en = contextFor(new TextEncoder().encode("GGUF\x03\x00\x00\x00"), "bad.gguf", "en");
    await expect(mlWeightsViewer.open(en.context)).rejects.toMatchObject({
      code: "invalid-file",
      message: "GGUF file is too short.",
    });
    expect(en.container.childElementCount).toBe(0);
  });

  it("honours an abort during opening", async () => {
    const test = contextFor(GGUF_SAMPLE, "stories260K.gguf");
    test.abortController.abort();
    await expect(mlWeightsViewer.open(test.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
  });
});
