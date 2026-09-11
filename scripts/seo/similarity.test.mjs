import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPage, auditPages, shingles, overlap, tokens } from "./similarity.mjs";

test("extract visible main blocks, retain nosnippet, decode entities, ignore scripts and navigation", async () => {
  const page = await extractPage(`<html><head><title>A</title><meta name="description" content="D">
    <link rel="canonical" href="https://example.com/en/formats/a"></head><body>
    <header><p>Global header</p></header><main><script>throw new Error('must not run')</script>
    <nav><p>Breadcrumb</p></nav><h1>A</h1><p>One &amp; two</p>
    <div data-nosnippet><p>Indexable implementation</p></div><p hidden>Hidden</p>
    <div>Summary <span>in a div</span></div>
    <ul><li><p>Nested paragraph</p></li></ul></main></body></html>`, "https://example.com/en/formats/a");
  assert.deepEqual(page.blocks, ["A", "One & two", "Indexable implementation", "Summary in a div", "Nested paragraph"]);
  assert.deepEqual(page.issues, []);
});

test("Chinese tokenization, identical/different text, empty content and asymmetric containment", () => {
  assert.deepEqual(tokens("查看 PNG 文件"), ["查", "看", "png", "文", "件"]);
  const short = shingles(["one two three four five six"]);
  assert.equal(overlap(short, short).jaccard, 1);
  assert.equal(overlap(short, shingles(["unrelated entirely separate words here"])).jaccard, 0);
  assert.equal(overlap(new Set(), new Set()).jaccard, 0);
  const long = shingles(["one two three four five six seven eight nine"]);
  assert.equal(overlap(short, long).containment, 1);
  assert.ok(overlap(short, long).jaccard < 1);
});

test("remove common blocks without treating language variants as duplicates", () => {
  const common = "Your files stay on this device and are never uploaded anywhere.";
  const make = (id, locale, text) => ({ url: `https://example.com/${locale}/formats/${id}`,
    locale, type: "formats", title: id, description: id, blocks: [common, text], issues: [] });
  const a = "Alpha beta gamma delta epsilon zeta eta theta.";
  const b = "Iota kappa lambda mu nu xi omicron pi.";
  const c = "Rho sigma tau upsilon phi chi psi omega.";
  const result = auditPages([make("a", "en", a), make("b", "en", b), make("c", "en", c), make("a", "zh-CN", a)]);
  assert.equal(result.repeatedBlocks.length, 1);
  assert.equal(result.pages[0].nearest.coreJaccard, 0);
  assert.ok(result.pages[0].commonBlockTokenShare > 0);
  assert.equal(result.pages[3].nearest, null);
  assert.equal(result.duplicateMetadata.length, 0);
});

test("flag canonical and indexing issues and report duplicate metadata", async () => {
  const html = '<title>Repeated</title><meta name="description" content="Same"><meta name="robots" content="noindex"><link rel="canonical" href="/en/formats/other"><main><p>Content</p></main>';
  const a = await extractPage(html, "https://example.com/en/formats/a");
  const b = await extractPage(html, "https://example.com/en/formats/b");
  assert.ok(a.issues.includes("canonical-not-self"));
  assert.ok(a.issues.includes("noindex"));
  assert.ok(a.issues.includes("h1-count-not-one"));
  assert.equal(auditPages([a, b]).duplicateMetadata.length, 2);
});
