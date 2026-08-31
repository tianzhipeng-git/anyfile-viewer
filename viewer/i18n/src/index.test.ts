import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  interpolate,
  localizeText,
  normalizeLocale,
} from "./index";

describe("i18n", () => {
  it("defines the ten supported locales with English as the fallback", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(normalizeLocale("zh-cn")).toBe("zh-CN");
    expect(normalizeLocale("zh-Hans")).toBe("zh-CN");
    expect(normalizeLocale("de-DE")).toBe("de");
    expect(normalizeLocale("unknown")).toBe("en");
  });

  it("falls back localized text and interpolates named values", () => {
    expect(localizeText({ en: "Viewer", "zh-CN": "查看器" }, "zh-CN")).toBe("查看器");
    expect(localizeText({ en: "Viewer" }, "fr")).toBe("Viewer");
    expect(localizeText({ en: "Viewer", fr: "" }, "fr")).toBe("Viewer");
    expect(interpolate("Open {count} files", { count: 2 })).toBe("Open 2 files");
  });
});
