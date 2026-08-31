import type { PublishedLocale } from "../i18n/config";

import { categoryContents } from "./categories";
import { formatContents } from "./formats";
import { manifestsForExtension, viewerManifests } from "./manifests";
import { pluginContents } from "./plugins";

export const publishedFormats = formatContents.filter(({ status }) => status === "published");
export const publishedCategories = categoryContents.filter(({ status }) => status === "published");
export const publishedPlugins = pluginContents.filter(({ status }) => status === "published");

export function getFormat(extension: string, locale: PublishedLocale) {
  const content = publishedFormats.find((item) => item.extension === extension.toLowerCase());
  if (!content) return undefined;
  return { ...content, ...content.copy[locale], pluginIds: manifestsForExtension(content.extension).map(({ id }) => id) };
}

export function getCategory(slug: string, locale: PublishedLocale) {
  const content = publishedCategories.find((item) => item.slug === slug);
  if (!content) return undefined;
  return { ...content, ...content.copy[locale], extensions: publishedFormats.filter(({ categoryId }) => categoryId === slug).map(({ extension }) => extension) };
}

export function getCategories(locale: PublishedLocale) {
  return publishedCategories.map(({ slug }) => getCategory(slug, locale)!);
}

export function getCategoryFormats(slug: string, locale: PublishedLocale) {
  return publishedFormats.filter(({ categoryId }) => categoryId === slug).map(({ extension }) => getFormat(extension, locale)!);
}

export function getPlugin(pluginId: string, locale: PublishedLocale) {
  const content = publishedPlugins.find((item) => item.pluginId === pluginId);
  const manifest = viewerManifests.find(({ id }) => id === pluginId);
  if (!content || !manifest) return undefined;
  return {
    ...content, ...content.copy[locale], manifest,
    formats: publishedFormats.filter(({ extension }) => manifestsForExtension(extension).some(({ id }) => id === pluginId)).map(({ extension }) => getFormat(extension, locale)!),
  };
}

export { viewerManifests } from "./manifests";
