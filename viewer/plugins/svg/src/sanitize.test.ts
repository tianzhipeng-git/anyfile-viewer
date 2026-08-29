import { describe, expect, it } from "vitest";

import { looksLikeSvg, sanitizeSvg } from "./sanitize";

const encode = (source: string) => new TextEncoder().encode(source);

describe("SVG sanitization", () => {
  it("preserves local paint references and removes active or external content", () => {
    const result = sanitizeSvg(encode(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <style>@import url(https://example.com/style.css)</style>
      <script>alert(1)</script>
      <defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs>
      <rect fill="url(#g)" style="fill:blue"/>
      <image href="https://example.com/private.png"/>
      <use href="#shape"/>
    </svg>`));

    expect(result?.source).toContain('fill="url(#g)"');
    expect(result?.source).toContain('href="#shape"');
    expect(result?.source).not.toMatch(/script|onload|example\.com|style=/);
    expect(result?.removedItems).toBe(5);
  });

  it("rejects non-SVG XML, doctypes, malformed input, and invalid UTF-8", () => {
    expect(sanitizeSvg(encode("<html/>"))).toBeUndefined();
    expect(sanitizeSvg(encode('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
    expect(sanitizeSvg(encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeUndefined();
    expect(sanitizeSvg(new Uint8Array([0xff, 0xff, 0xff]))).toBeUndefined();
  });

  it("recognizes a bounded SVG preamble without accepting arbitrary XML", () => {
    expect(looksLikeSvg(encode('<?xml version="1.0"?><!-- fixture --><svg xmlns="http://www.w3.org/2000/svg">'))).toBe(true);
    expect(looksLikeSvg(encode("<html><svg>"))).toBe(false);
  });
});
