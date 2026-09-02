import type { PublishedLocale } from "../i18n/config";

import { categoryContents } from "./categories";
import { formatContents } from "./formats";
import { manifestsForExtension, viewerManifests } from "./manifests";
import { panoramaViewerContents } from "./panorama-viewers";
import { pluginContents } from "./plugins";

export const publishedFormats = formatContents.filter(({ status }) => status === "published");
export const publishedFormatRoutes = publishedFormats.flatMap(({ extension, aliases = [] }) => [extension, ...aliases]);
export const publishedCategories = categoryContents.filter(({ status }) => status === "published");
export const publishedPlugins = pluginContents.filter(({ status }) => status === "published");
export const publishedPanoramaViewers = panoramaViewerContents.filter(({ status }) => status === "published");

export function getFormat(extension: string, locale: PublishedLocale) {
  const normalized = extension.toLowerCase();
  const content = publishedFormats.find((item) => item.extension === normalized || item.aliases?.includes(normalized));
  if (!content) return undefined;
  return { ...content, ...content.copy[locale], pluginIds: manifestsForExtension(content.extension).map(({ id }) => id) };
}

export function getCategory(slug: string, locale: PublishedLocale) {
  const content = publishedCategories.find((item) => item.slug === slug);
  if (!content) return undefined;
  const extensions = content.formatExtensions
    ?? publishedFormats.filter(({ categoryId }) => categoryId === slug).map(({ extension }) => extension);
  return { ...content, ...content.copy[locale], extensions };
}

export function getCategories(locale: PublishedLocale) {
  return publishedCategories.map(({ slug }) => getCategory(slug, locale)!);
}

export function getCategoryFormats(slug: string, locale: PublishedLocale) {
  const category = getCategory(slug, locale);
  if (!category) return [];
  return category.extensions.map((extension) => getFormat(extension, locale)).filter((format) => format !== undefined);
}

export function getPanoramaViewer(viewerId: string, locale: PublishedLocale) {
  const content = publishedPanoramaViewers.find((item) => item.viewerId === viewerId);
  if (!content) return undefined;
  return { ...content, ...content.copy[locale] };
}

export function getPanoramaViewers(locale: PublishedLocale) {
  return publishedPanoramaViewers.map(({ viewerId }) => getPanoramaViewer(viewerId, locale)!);
}

export function getPanoramaViewersForExtension(extension: string, locale: PublishedLocale) {
  const normalized = extension.toLowerCase();
  return getPanoramaViewers(locale).filter(({ formatExtensions }) => formatExtensions.includes(normalized));
}

export function getPanoramaViewerForPlugin(pluginId: string, locale: PublishedLocale) {
  const content = publishedPanoramaViewers.find((item) => item.pluginId === pluginId);
  return content ? getPanoramaViewer(content.viewerId, locale) : undefined;
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
