// Compatibility facade for shared navigation components. SEO content lives in src/content.
export {
  getCategories,
  getCategory,
  getCategoryFormats,
  getFormat,
  publishedCategories as categories,
  publishedFormats as formats,
} from "@/content";

export type FileCategory = ReturnType<typeof import("@/content").getCategories>[number];
export type FileFormat = NonNullable<ReturnType<typeof import("@/content").getFormat>>;
