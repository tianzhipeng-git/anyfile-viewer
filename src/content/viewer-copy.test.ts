import { describe, expect, it } from "vitest";

import { PUBLISHED_LOCALES } from "../i18n/config";
import { localizedPageMetadata } from "../lib/seo";
import { getCategory, getFormat, getPanoramaViewer, publishedCategories, publishedFormats, publishedPanoramaViewers } from ".";

describe("user-facing search copy", () => {
  it("keeps DOCX search and visible copy about reading documents", () => {
    const format = getFormat("docx", "en")!;
    expect(format.searchTitle).toBe("Open DOCX Documents Online — Free, No Upload");
    expect(format.description).toBe("Read Word DOCX documents in your browser, including text, tables and images. Free, with no uploads, signup or software installation.");
    expect(format.description).not.toMatch(/XML|ZIP|docx-preview|render/i);
    expect(format.introduction).toContain("docx-preview");
    expect(getFormat("docx", "zh-CN")!.description).toContain("免费使用，无需上传、注册或安装软件");
  });

  it("uses consistent, distinct search copy across all published landing pages", () => {
    for (const locale of PUBLISHED_LOCALES) {
      const pages = [
        ...publishedFormats.map(({ extension }) => getFormat(extension, locale)!),
        ...publishedCategories.map(({ slug }) => getCategory(slug, locale)!),
        ...publishedPanoramaViewers.map(({ viewerId }) => getPanoramaViewer(viewerId, locale)!),
      ];
      expect(new Set(pages.map(({ searchTitle }) => searchTitle)).size).toBe(pages.length);
      for (const page of pages) {
        expect(page.searchTitle).not.toContain("Anyfile");
        expect(page.searchTitle).toContain(locale === "en" ? "Free, No Upload" : "免费，无需上传");
        expect(page.description).not.toMatch(/docx-preview|PDF\.js|WebAssembly|WebCodecs|Web Audio|browser Worker|浏览器 Worker/i);
        const metadata = localizedPageMetadata({ locale, title: page.searchTitle, description: page.description });
        expect(metadata).toMatchObject({
          title: page.searchTitle,
          description: page.description,
          openGraph: { title: page.searchTitle, description: page.description },
          twitter: { title: page.searchTitle, description: page.description },
        });
      }
    }
  });

  it("keeps every format and category preview concise and free of implementation jargon", () => {
    for (const locale of PUBLISHED_LOCALES) {
      const pages = [
        ...publishedFormats.map(({ extension }) => getFormat(extension, locale)!),
        ...publishedCategories.map(({ slug }) => getCategory(slug, locale)!),
      ];
      expect(new Set(pages.map(({ description }) => description)).size).toBe(pages.length);
      for (const page of pages) {
        expect(page.searchTitle.length, page.title).toBeLessThanOrEqual(65);
        expect(page.description.length, page.title).toBeLessThanOrEqual(170);
        expect(page.description, page.title).not.toMatch(/tessellat|virtualized|deserializ|docx-preview|PDF\.js|WebAssembly|WebCodecs|schema|离散化|虚拟化|反序列化|渲染器/iu);
      }
    }
    expect(getCategory("3d-models", "zh-CN")!.title).toContain("3D");
    expect(getCategory("ebooks", "en")!.description).toContain("ebooks");
    expect(getFormat("step", "en")!.description).toContain("rotate");
    expect(getFormat("las", "en")!.description).toContain("sampled preview");
  });

  it("preserves restricted viewing tasks and canonical aliases", () => {
    expect(getFormat("zip", "en")!.description).toContain("no extraction or editing");
    expect(getFormat("odt", "en")!.description).toContain("File listing only, not a document preview");
    expect(getFormat("usdz", "en")!.description).toContain("No 3D model preview");
    expect(getFormat("tif", "en")!.searchTitle).toBe(getFormat("tiff", "en")!.searchTitle);
  });
});
