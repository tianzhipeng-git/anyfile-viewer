import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateManifest, type Locale } from "@anyfile/viewer-protocol";
import { createViewerTestContext, type ViewerTestContext } from "@anyfile/viewer-test";

import { mlWeightsViewer } from "./index";
import { mlWeightsManifest } from "./manifest";
import { parseGgufStruct } from "./gguf";
import { readModel } from "./parse";

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
  });
});

describe("ml-weights probe", () => {
  it("returns support 3 for real GGUF and safetensors", async () => {
    const { probeMlWeights } = await import("./probe");
    expect(await probeMlWeights({ file: new File([GGUF_SAMPLE.slice().buffer as ArrayBuffer], "a.gguf"), signal: new AbortController().signal })).toBe(3);
    expect(await probeMlWeights({ file: new File([SAFETENSORS_SAMPLE.slice().buffer as ArrayBuffer], "a.safetensors"), signal: new AbortController().signal })).toBe(3);
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
    const controller = await mlWeightsViewer.open(test.context);

    expect(test.container.textContent).toContain("GGUF v3");
    expect(test.container.textContent).toContain("token_embd.weight");
    expect(test.container.textContent).toContain("llama.block_count");
    expect(test.container.querySelectorAll(".anyfile-ml-weights-viewer__table tbody tr").length).toBeGreaterThan(5);
    expect(test.progress.at(-1)?.stage).toBe("ready");

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

  it("renders tensor list from the real safetensors sample", async () => {
    const test = contextFor(SAFETENSORS_SAMPLE, "model.safetensors", "en");
    const controller = await mlWeightsViewer.open(test.context);
    expect(test.container.textContent).toContain("bert.embeddings.word_embeddings.weight");
    expect(test.container.textContent).toContain("Tensors");
    await controller.dispose();
  });

  it("rejects an invalid file through open()", async () => {
    const test = contextFor(new TextEncoder().encode("not a model"), "bad.gguf");
    await expect(mlWeightsViewer.open(test.context)).rejects.toMatchObject({ code: "invalid-file" });
    expect(test.container.childElementCount).toBe(0);
  });

  it("honours an abort during opening", async () => {
    const test = contextFor(GGUF_SAMPLE, "stories260K.gguf");
    test.abortController.abort();
    await expect(mlWeightsViewer.open(test.context)).rejects.toMatchObject({ name: "AbortError" });
    expect(test.container.childElementCount).toBe(0);
  });
});
