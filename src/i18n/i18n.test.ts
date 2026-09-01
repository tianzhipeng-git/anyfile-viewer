import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_LOCALES } from "@anyfile/i18n";

import english from "./dictionaries/en";
import chinese from "./dictionaries/zh-CN";
import { PUBLISHED_LOCALES, alternateLanguages, localePath, siteUrl } from "./config";
import { viewerRegistrations } from "../lib/viewer-registrations";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => leafKeys(item, `${prefix}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") return sourceFiles(path);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  }))).flat();
}

describe("application i18n contract", () => {
  it("publishes English and Simplified Chinese within the ten-locale architecture", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
    expect(PUBLISHED_LOCALES).toEqual(["en", "zh-CN"]);
  });

  it("keeps published dictionaries structurally complete and non-empty", () => {
    expect(leafKeys(chinese)).toEqual(leafKeys(english));
    expect(stringLeaves(english).every((value) => value.trim().length > 0)).toBe(true);
    expect(stringLeaves(chinese).every((value) => value.trim().length > 0)).toBe(true);
  });

  it("localizes every registered manifest in both published locales", () => {
    for (const { manifest } of viewerRegistrations) {
      expect(manifest.name.en.trim(), manifest.id).not.toBe("");
      expect(manifest.name["zh-CN"]?.trim(), manifest.id).not.toBe("");
      for (const format of manifest.formats) {
        expect(format.name.en.trim(), manifest.id).not.toBe("");
        expect(format.name["zh-CN"]?.trim(), manifest.id).not.toBe("");
      }
    }
  });

  it("builds prefixed paths and reciprocal alternates", () => {
    expect(localePath("en", "/formats/pdf")).toBe("/en/formats/pdf");
    expect(alternateLanguages("/formats/pdf")).toEqual({
      en: "/en/formats/pdf",
      "zh-CN": "/zh-CN/formats/pdf",
      "x-default": "/en/formats/pdf",
    });
  });

  it("uses www.anyfile.top as the canonical production host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://anyfile.top");
    try {
      expect(siteUrl().toString()).toBe("https://www.anyfile.top/");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps locale selection out of plugin business logic", async () => {
    const files = await sourceFiles(join(process.cwd(), "viewer/plugins"));
    const directLocaleBranch = /(?:context\.)?locale\s*(?:===|!==|==|!=)\s*["'](?:en|zh-CN|es|de|fr|ja|pt|ru|ko|it)["']/;
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (directLocaleBranch.test(source) || source.includes("navigator.language")) violations.push(file);
    }
    expect(violations).toEqual([]);
  });
});
