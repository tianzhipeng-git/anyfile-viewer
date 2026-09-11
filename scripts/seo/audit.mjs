import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { Window } from "happy-dom";
import { extractPage, auditPages } from "./similarity.mjs";

const { values } = parseArgs({ options: {
  input: { type: "string", default: ".next/server/app" },
  output: { type: "string", default: "docs/tasks/seo-content-audit/latest" },
} });
const input = resolve(values.input);
const output = resolve(values.output);
const sitemapPath = join(input, "sitemap.xml.body");
const sitemap = await readFile(sitemapPath, "utf8");
const window = new Window();
const xml = new window.DOMParser().parseFromString(sitemap, "application/xml");
const urls = [...xml.querySelectorAll("url > loc")].map((el) => el.textContent.trim())
  .filter((url) => /^\/(en|zh-CN)\/(formats|categories|plugins|viewers)\/[^/]+\/?$/.test(new URL(url).pathname));
await window.happyDOM.close();
if (!urls.length) throw new Error("No content URLs in sitemap; run pnpm build first.");
const pages = [];
const failures = [];
for (const url of urls) {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, "");
    const file = join(input, `${pathname}.html`);
    const page = await extractPage(await readFile(file, "utf8"), url);
    page.htmlModifiedAt = (await stat(file)).mtime.toISOString();
    pages.push(page);
  } catch (error) { failures.push({ url, error: error.message }); }
}
if (!pages.length) throw new Error("No HTML pages could be read.");
const result = auditPages(pages);
const report = { generatedAt: new Date().toISOString(), input,
  sitemapModifiedAt: (await stat(sitemapPath)).mtime.toISOString(),
  scope: "Built sitemap content URLs only; local snapshot, not live site or indexing status.",
  method: "Within-locale 5-token shingle Jaccard; common exact blocks occur in >= max(3, ceil(10% of locale pages)). Core removes those blocks. Containment measures overlap of the smaller shingle set. Heuristics are not search engine thresholds.",
  requested: urls.length, failures, ...result };
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const cell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const lines = ["# 内容相似度审计", "",
  `生成时间：${report.generatedAt}；构建 sitemap 时间：${report.sitemapModifiedAt}。`, "",
  `范围：${urls.length} 个 sitemap 内容 URL，成功 ${pages.length}，失败 ${failures.length}。只分析本地构建快照，不代表线上版本或搜索引擎收录状态。`, "",
  "指标：同语言正文按连续 5 token 计算 Jaccard；中文以汉字、英文以词为 token。公共段落 = 同语言至少 max(3, 10% 页面数向上取整) 页完全重复的段落；核心正文剔除这些段落。包含率表示较短正文的 shingle 被另一页覆盖的比例。所有阈值仅用于人工排查，不是 Google/Bing 算法或处罚线。", "",
  "提取 main 中的文本，按块级元素分段（包含 div/span 包裹的摘要及卡片）；去除脚本、导航和显式隐藏内容，保留 data-nosnippet 内容。不执行 JS/CSS，无法识别仅 CSS 隐藏文本；无语义模型，低分不能证明搜索意图独立。核心正文过少也可能导致低分。", "",
  `候选页面对：${result.pairs.length}；重复元数据组：${result.duplicateMetadata.length}；有静态标记问题的页面：${pages.filter((page) => page.issues.length).length}。`, "",
  "## 最相似页面对（前 40）", "",
  "| 页面 A | 页面 B | 正文相似 | 核心相似 | 核心包含率 |", "| --- | --- | --- | --- | --- |",
  ...result.pairs.slice(0, 40).map((pair) => `| ${pair.a} | ${pair.b} | ${pct(pair.rawJaccard)} | ${pct(pair.coreJaccard)} | ${pct(pair.coreContainment)} |`), "",
  "## 核心正文最少的页面（前 25，token 不是 SEO 字数门槛）", "",
  "| 页面 | 核心 token | 公共段落占比 |", "| --- | --- | --- |",
  ...[...result.pages].sort((a, b) => a.coreTokens - b.coreTokens).slice(0, 25)
    .map((page) => `| ${page.url} | ${page.coreTokens} | ${pct(page.commonBlockTokenShare)} |`), "",
  "## 最常见公共段落（前 20）", "",
  ...result.repeatedBlocks.slice(0, 20).map((item) => `- ${item.locale} / ${item.count} 页：${cell(item.block)}`), "",
  "## 元数据及提取问题", "",
  ...result.pages.filter((page) => page.issues.length).map((page) => `- ${page.url}: ${page.issues.join(", ")}`),
  ...result.duplicateMetadata.map((item) => `- 重复 ${item.field}: ${cell(item.value)} — ${item.urls.join(", ")}`),
  ...failures.map((item) => `- 读取失败 ${item.url}: ${cell(item.error)}`), "",
  "## 如何处理", "",
  "- 优先核实 canonical/noindex 等静态问题是否符合预期；本工具不检查线上状态码、robots.txt、HTTP 头、抓取日志或 Google 选定 canonical。",
  "- 查看 audit.json 的 sharedBlocks 和双方 distinctBlocks，判断是共享事实、不同格式的相同功能，还是同一用户任务的重复页面。",
  "- 独立格式补充真实的格式差异、使用场景、限制和排错信息；等价别名才考虑合并重定向。不要只改同义词或为凑字数扩写。",
  "- 结合 GSC/Bing 未索引原因逐 URL 验证；未抓取和抓取后未索引不能混为一谈。不自动修改 canonical、noindex 或内容。", "",
  "完整页面指标、候选对及重叠证据见同目录 audit.json。", "",
];
await mkdir(output, { recursive: true });
await writeFile(join(output, "audit.json"), JSON.stringify(report, null, 2) + "\n");
await writeFile(join(output, "report.md"), lines.join("\n"));
console.log(JSON.stringify({ pages: pages.length, failures: failures.length, pairs: result.pairs.length, report: join(output, "report.md") }, null, 2));
if (failures.length) process.exitCode = 1;
