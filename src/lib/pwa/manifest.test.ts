import { describe, expect, it } from "vitest";

import { viewerManifests } from "@/content/manifests";
import { PUBLISHED_LOCALES } from "@/i18n/config";
import { viewerRegistrations } from "@/lib/viewer-registrations";
import {
  DANGEROUS_FILE_HANDLER_EXTENSIONS,
  MAX_FILE_HANDLER_EXTENSIONS,
  MAX_FILE_HANDLER_EXTENSION_LENGTH,
} from "./file-handlers";
import { buildWebAppManifest, webAppManifestResponse } from "./manifest";

const VALID_EXTENSION = /^\.[a-z0-9]{1,15}$/;
const VALID_MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

const supportedExtensions = new Set(
  [...viewerManifests, ...viewerRegistrations.map((registration) => registration.manifest)]
    .flatMap((manifest) => manifest.formats.flatMap((format) => format.extensions))
    .map((extension) => extension.toLowerCase()),
);

describe("PWA web app manifest", () => {
  it("builds a stable standalone manifest launching directly into the isolated viewer for every locale", () => {
    for (const locale of PUBLISHED_LOCALES) {
      const manifest = buildWebAppManifest(locale);
      expect(manifest.id).toBe("/view");
      expect(manifest.start_url).toBe(`/${locale}/view`);
      expect(manifest.scope).toBe("/");
      expect(manifest.display).toBe("standalone");
      expect(manifest.lang).toBe(locale);
      expect(manifest.launch_handler.client_mode).toContain("focus-existing");
      expect(manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`)).toEqual(
        expect.arrayContaining(["192x192:any", "192x192:maskable", "512x512:any", "512x512:maskable"]),
      );
      expect(manifest.file_handlers.length).toBeGreaterThan(0);
      for (const handler of manifest.file_handlers) {
        expect(handler.action).toBe(`/${locale}/view`);
        expect(handler.launch_type).toBe("single-client");
      }
    }
  });

  it("enforces Chromium File Handling API limits, safe extensions and manifest support coverage", () => {
    const manifest = buildWebAppManifest("en");
    const seen = new Set<string>();

    for (const handler of manifest.file_handlers) {
      for (const [mimeType, extensions] of Object.entries(handler.accept)) {
        expect(mimeType).toMatch(VALID_MIME_TYPE);
        expect(extensions.length).toBeGreaterThan(0);
        for (const extension of extensions) {
          expect(extension).toMatch(VALID_EXTENSION);
          expect(extension.length).toBeLessThanOrEqual(MAX_FILE_HANDLER_EXTENSION_LENGTH);
          expect(DANGEROUS_FILE_HANDLER_EXTENSIONS.has(extension)).toBe(false);
          expect(seen.has(extension)).toBe(false);
          expect(supportedExtensions.has(extension), `Unsupported file_handler extension: ${extension}`).toBe(true);
          seen.add(extension);
        }
      }
    }

    expect(seen.size).toBeGreaterThan(100);
    expect(seen.size).toBeLessThan(MAX_FILE_HANDLER_EXTENSIONS);
  });

  it("serves application/manifest+json with same-origin CORP and revalidation", async () => {
    const response = webAppManifestResponse("zh-CN");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");

    const parsed = await response.json();
    expect(parsed.start_url).toBe("/zh-CN/view");
    expect(parsed.id).toBe("/view");
  });
});
