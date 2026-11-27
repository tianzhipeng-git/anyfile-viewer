// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
const NOOP_VENDOR: VendorAssets = { url: async () => "", bytes: async () => new Uint8Array() };

function context(name: string): ExtractContext {
  const filePath = resolve(EXAMPLES, name);
  const bytes = new Uint8Array(readFileSync(filePath));
  return {
    source: createBufferBinarySource(bytes, name, filePath),
    file: new File([bytes], name),
    vendor: NOOP_VENDOR,
    signal: new AbortController().signal,
  };
}

describe("chm ./extract", () => {
  it("passes extractor compliance on the real CHM samples", { timeout: 30_000 }, async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "sample-handbook.chm",
        filePath: resolve(EXAMPLES, "sample-handbook.chm"),
        invalidBytes: readFileSync(resolve(EXAMPLES, "truncated-header.chm")),
        filter: "LZX",
      },
      { name: "cjk-gbk.chm", filePath: resolve(EXAMPLES, "cjk-gbk.chm") },
      { name: "malicious-sandbox.chm", filePath: resolve(EXAMPLES, "malicious-sandbox.chm") },
    ]);
  });

  it("reports system metadata, topics and the contents tree", async () => {
    const inspected = await extractor.inspect(context("sample-handbook.chm"));
    expect(inspected.metadata).toMatchObject({ title: "Anyfile CHM Handbook", lcid: "0x0409", topicCount: 3, indexEntryCount: 3 });
    expect(inspected.metadata.toc).toContainEqual({ label: "— Architecture", chapter: 2 });
    expect(inspected.targets[0]).toEqual({ id: "chapter:1", title: "Welcome (topics/getting started.html)", kind: "topic" });
  });

  it("reads decoded topic text without scripts or embedded objects", async () => {
    const gbk = await extractor.read(context("cjk-gbk.chm"), { target: "chapter:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(gbk.content).toBe("## Topic 1: 中文目录首页\n\n### 中文帮助手册\n\n这是一份使用 GBK 编码的 CHM 测试文档。");

    const unsafe = await extractor.read(context("malicious-sandbox.chm"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(unsafe.content).toContain("Safe paragraph remains readable.");
    expect(unsafe.content).not.toMatch(/<script|alert\(|ActiveX|clsid/i);
  });

  it("maps corrupt files to standard error codes", async () => {
    await expect(extractor.inspect(context("corrupt-loop.chm"))).rejects.toMatchObject({ code: "invalid-file" });
    await expect(extractor.inspect(context("disguised-text.chm"))).rejects.toMatchObject({ code: "invalid-file" });
  });
});
