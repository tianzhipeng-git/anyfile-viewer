import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PUBLISHED_LOCALES } from "../i18n/config";

import { getCategory, getFormat, getPanoramaViewer, getPanoramaViewerForPlugin, getPanoramaViewersForExtension, getPlugin, publishedCategories, publishedFormatRoutes, publishedFormats, publishedPanoramaViewers, publishedPlugins, viewerManifests } from ".";
import { manifestsForExtension } from "./manifests";

const unique = (values: readonly string[]) => new Set(values).size === values.length;

describe("published SEO content", () => {
  it("maps every format to exact Manifest capabilities and a published category", () => {
    for (const content of publishedFormats) {
      const manifests = viewerManifests.filter((manifest) => manifest.formats.some(({ extensions }) => extensions.includes(`.${content.extension}`)));
      expect(manifests.map(({ id }) => id), content.extension).not.toHaveLength(0);
      expect(publishedCategories.some(({ slug }) => slug === content.categoryId), content.extension).toBe(true);
      for (const locale of PUBLISHED_LOCALES) {
        const format = getFormat(content.extension, locale)!;
        expect(format.pluginIds).toEqual(manifests.map(({ id }) => id));
        expect(format.title.trim()).not.toBe("");
        expect(format.description.trim()).not.toBe("");
        expect(format.introduction.trim()).not.toBe("");
        expect(format.limitations.length).toBeGreaterThan(0);
        expect(format.faq.length).toBeGreaterThan(0);
        if (format.capability.typicalLevel <= 2) expect(format.alternatives?.length, content.extension).toBeGreaterThan(0);
      }
    }
  });

  it("publishes every non-code Manifest extension", () => {
    const routes = new Set(publishedFormatRoutes.map((extension) => `.${extension}`));
    for (const manifest of viewerManifests) {
      if (manifest.id === "ace-code-text") continue;
      for (const format of manifest.formats) {
        for (const extension of format.extensions) {
          if (extension === "*") continue;
          expect(routes.has(extension), `${manifest.id}: ${extension}`).toBe(true);
        }
      }
    }
  });

  it("publishes complete categories and plugin pages with valid reverse links", () => {
    expect(publishedPlugins.map(({ pluginId }) => pluginId).sort()).toEqual(viewerManifests.map(({ id }) => id).sort());
    for (const locale of PUBLISHED_LOCALES) {
      for (const { slug } of publishedCategories) {
        const category = getCategory(slug, locale)!;
        expect(category.extensions.length, slug).toBeGreaterThan(0);
        expect(category.introduction.trim()).not.toBe("");
        expect(category.faq.length).toBeGreaterThan(0);
      }
      for (const { pluginId } of publishedPlugins) {
        const plugin = getPlugin(pluginId, locale)!;
        expect(plugin.manifest.id).toBe(pluginId);
        expect(plugin.summary.trim()).not.toBe("");
        for (const format of plugin.formats) expect(format.pluginIds).toContain(pluginId);
      }
    }
  });

  it("publishes the 360 camera hub and localized viewer guides", () => {
    expect(getCategory("360-cameras", "en")!.extensions).toEqual(["insv", "insp", "lrv", "360", "osv", "dng", "jpg"]);
    expect(publishedPanoramaViewers.map(({ viewerId }) => viewerId)).toEqual(["insta360", "gopro-max", "dji-osmo-360"]);
    for (const locale of PUBLISHED_LOCALES) {
      for (const { viewerId, pluginId, formatExtensions } of publishedPanoramaViewers) {
        const viewer = getPanoramaViewer(viewerId, locale)!;
        expect(viewer.title.trim()).not.toBe("");
        expect(viewer.formats.map(({ extension }) => extension)).toEqual(formatExtensions);
        expect(viewer.faq.length).toBeGreaterThan(0);
        expect(getPanoramaViewerForPlugin(pluginId, locale)?.viewerId).toBe(viewerId);
        for (const extension of formatExtensions) {
          expect(getFormat(extension, locale), `${viewerId}: ${extension}`).toBeDefined();
          expect(getPanoramaViewersForExtension(extension, locale).map((item) => item.viewerId)).toContain(viewerId);
        }
      }
    }
  });

  it("keeps data separate from developer code and artifacts", () => {
    expect(getCategory("code-data", "en")!.name).toBe("Data");
    expect(getCategory("developer-artifacts", "en")!.name).toBe("Developer");

    for (const extension of ["md", "txt", "xml"]) {
      expect(getFormat(extension, "en")!.categoryId, extension).toBe("developer-artifacts");
    }
  });

  it("publishes the audited licenses and source notices for browser runtimes", () => {
    expect(getPlugin("word-document", "en")!.upstreamProjects[0]?.license).toBe("Apache-2.0");
    expect(getPlugin("powerpoint-presentation", "en")!.upstreamProjects[0]?.license).toBe("Apache-2.0");
    expect(getPlugin("camera-raw", "en")!.upstreamProjects[0]).toMatchObject({
      license: "ISC; bundled LibRaw distributed under CDDL-1.0",
      noticeUrl: "/vendor/libraw/1.6.0/SOURCE.md",
    });
    expect(getPlugin("non-native-video", "en")!.upstreamProjects[0]?.noticeUrl)
      .toBe("/vendor/licenses/mediabunny/1.55.3/SOURCE.md");
  });

  it("keeps localized metadata and route keys unique", () => {
    expect(unique(publishedFormats.map(({ extension }) => extension))).toBe(true);
    expect(unique(publishedCategories.map(({ slug }) => slug))).toBe(true);
    expect(unique(publishedPlugins.map(({ pluginId }) => pluginId))).toBe(true);
    expect(unique(publishedPanoramaViewers.map(({ viewerId }) => viewerId))).toBe(true);
    expect(unique(publishedFormatRoutes)).toBe(true);
    for (const { extension, aliases = [] } of publishedFormats) {
      expect(aliases).not.toContain(extension);
      for (const alias of aliases) {
        expect(manifestsForExtension(alias).length, alias).toBeGreaterThan(0);
        expect(getFormat(alias, "en")?.extension).toBe(extension);
      }
    }
    for (const locale of PUBLISHED_LOCALES) {
      expect(unique(publishedFormats.map(({ extension }) => getFormat(extension, locale)!.title))).toBe(true);
      expect(unique(publishedFormats.map(({ extension }) => getFormat(extension, locale)!.description))).toBe(true);
      expect(unique(publishedFormats.map(({ extension }) => getFormat(extension, locale)!.introduction))).toBe(true);
      expect(unique(publishedFormats.flatMap(({ extension }) => getFormat(extension, locale)!.faq.map(({ question }) => question)))).toBe(true);
      expect(unique(publishedCategories.map(({ slug }) => getCategory(slug, locale)!.title))).toBe(true);
      expect(unique(publishedPlugins.map(({ pluginId }) => getPlugin(pluginId, locale)!.title))).toBe(true);
      expect(unique(publishedPanoramaViewers.map(({ viewerId }) => getPanoramaViewer(viewerId, locale)!.title))).toBe(true);
    }
  });

  it("keeps the SEO Manifest inventory free of registrations and plugin implementations", () => {
    const source = readFileSync(join(process.cwd(), "src/content/manifests.ts"), "utf8");
    expect(source).not.toContain("viewer-registrations");
    expect(source).not.toMatch(/from\s+["']@anyfile\/[\w-]+-viewer["']/);
    expect(source).not.toContain("/probe");
  });
});
