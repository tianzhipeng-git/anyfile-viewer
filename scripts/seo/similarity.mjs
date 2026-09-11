import { Window } from "happy-dom";

export const normalize = (text) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();

export async function extractPage(html, url) {
  const window = new Window({ settings: {
    disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true, disableIframePageLoading: true,
  } });
  try {
    const document = window.document;
    document.write(html);
    const title = document.title.trim();
    const description = document.querySelector('meta[name="description"]')?.content ?? "";
    const canonicals = [...document.querySelectorAll('link[rel="canonical"]')].map((el) => el.getAttribute("href"));
    const robots = [...document.querySelectorAll('meta[name="robots"],meta[name="googlebot"],meta[name="bingbot"]')]
      .map((el) => el.content).join(",");
    // data-nosnippet controls snippets, not indexing: deliberately retain that content.
    document.querySelectorAll('script,style,template,svg,nav,header,footer,button,[hidden],[aria-hidden="true"]')
      .forEach((el) => el.remove());
    const main = document.querySelector("main");
    const root = main ?? document.body;
    // Walk text once, including prose wrapped in div/span (such as plugin summaries).
    const blocks = [];
    let pending = "";
    const flush = () => {
      const text = pending.replace(/\s+/gu, " ").trim();
      if (text) blocks.push(text);
      pending = "";
    };
    const walk = (node) => {
      if (node.nodeType === 3) { pending += node.textContent; return; }
      const boundary = /^(MAIN|SECTION|ARTICLE|DIV|H[1-6]|P|UL|OL|LI|DL|DT|DD|TABLE|TR|TD|TH|BR)$/.test(node.nodeName);
      if (boundary) flush();
      for (const child of node.childNodes) walk(child);
      if (boundary) flush();
    };
    walk(root);
    flush();
    const issues = [];
    if (!main) issues.push("missing-main");
    if (!blocks.length) issues.push("empty-extracted-content");
    if (!title) issues.push("missing-title");
    if (!description) issues.push("missing-description");
    if (root.querySelectorAll("h1").length !== 1) issues.push("h1-count-not-one");
    if (canonicals.length !== 1) issues.push("canonical-count-not-one");
    else {
      try {
        if (new URL(canonicals[0], url).href !== url) issues.push("canonical-not-self");
      } catch { issues.push("invalid-canonical"); }
    }
    if (/\b(noindex|none)\b/i.test(robots)) issues.push("noindex");
    const path = new URL(url).pathname.split("/").filter(Boolean);
    return { url, locale: path[0], type: path[1], title, description, canonicals, robots, blocks, issues };
  } finally { await window.happyDOM.close(); }
}

// Han characters are individual tokens; Latin words/numbers remain whole tokens.
// This avoids treating a whole Chinese paragraph as one word. Scores are compared within locale.
export function tokens(text) {
  return normalize(text).match(/\p{Script=Han}|[\p{L}\p{N}]+/gu) ?? [];
}

export function shingles(blocks) {
  const result = new Set();
  for (const block of blocks) {
    const words = tokens(block);
    const size = Math.min(5, words.length);
    for (let i = 0; size && i <= words.length - size; i++) result.add(words.slice(i, i + size).join(" "));
  }
  return result;
}

export function overlap(a, b) {
  let shared = 0;
  const small = a.size < b.size ? a : b;
  const large = a.size < b.size ? b : a;
  for (const item of small) if (large.has(item)) shared++;
  return {
    jaccard: a.size + b.size ? shared / (a.size + b.size - shared) : 0,
    containment: small.size ? shared / small.size : 0,
  };
}

export function auditPages(pages) {
  const groups = Map.groupBy(pages, (page) => page.locale);
  const pairs = [];
  const publicPages = [];
  const repeatedBlocks = [];
  const duplicateMetadata = [];
  for (const [locale, group] of groups) {
    const frequencies = new Map();
    for (const page of group) {
      for (const block of new Set(page.blocks.map(normalize))) {
        frequencies.set(block, (frequencies.get(block) ?? 0) + 1);
      }
    }
    const cutoff = Math.max(3, Math.ceil(group.length * 0.1));
    for (const [block, count] of frequencies) {
      if (count >= cutoff) repeatedBlocks.push({ locale, count, block });
    }
    for (const field of ["title", "description"]) {
      for (const [value, matches] of Map.groupBy(group, (page) => normalize(page[field]))) {
        if (value && matches.length > 1) duplicateMetadata.push({ locale, field, value, urls: matches.map((page) => page.url) });
      }
    }
    const prepared = group.map((page) => {
      const core = page.blocks.filter((block) => frequencies.get(normalize(block)) < cutoff);
      const totalTokens = page.blocks.reduce((sum, block) => sum + tokens(block).length, 0);
      const coreTokens = core.reduce((sum, block) => sum + tokens(block).length, 0);
      const summary = { ...page, totalTokens, coreTokens,
        commonBlockTokenShare: totalTokens ? 1 - coreTokens / totalTokens : 0,
        nearest: null };
      publicPages.push(summary);
      return { page: summary, core, rawSet: shingles(page.blocks), coreSet: shingles(core) };
    });
    for (let i = 0; i < prepared.length; i++) {
      for (let j = i + 1; j < prepared.length; j++) {
        const a = prepared[i];
        const b = prepared[j];
        const raw = overlap(a.rawSet, b.rawSet);
        const core = overlap(a.coreSet, b.coreSet);
        const pair = { a: a.page.url, b: b.page.url, locale,
          rawJaccard: raw.jaccard, coreJaccard: core.jaccard, coreContainment: core.containment };
        for (const [source, target] of [[a, b], [b, a]]) {
          if (!source.page.nearest || core.jaccard > source.page.nearest.coreJaccard) {
            source.page.nearest = { url: target.page.url, ...core, coreJaccard: core.jaccard };
          }
        }
        // Review heuristics, never Google/Bing thresholds. Keep raw-only matches to expose boilerplate.
        if (raw.jaccard >= 0.5 || core.jaccard >= 0.35 || (core.containment >= 0.8 && Math.min(a.coreSet.size, b.coreSet.size) >= 30)) {
          const bBlocks = new Set(b.page.blocks.map(normalize));
          pair.sharedBlocks = a.page.blocks.filter((block) => bBlocks.has(normalize(block)));
          pair.aDistinctBlocks = a.core.filter((block) => !bBlocks.has(normalize(block))).slice(0, 5);
          const aBlocks = new Set(a.page.blocks.map(normalize));
          pair.bDistinctBlocks = b.core.filter((block) => !aBlocks.has(normalize(block))).slice(0, 5);
          pairs.push(pair);
        }
      }
    }
  }
  pairs.sort((a, b) => b.coreJaccard - a.coreJaccard || b.rawJaccard - a.rawJaccard);
  repeatedBlocks.sort((a, b) => b.count - a.count);
  return { pages: publicPages, pairs, repeatedBlocks, duplicateMetadata };
}
