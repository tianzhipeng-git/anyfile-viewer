import "server-only";

import type { PublishedLocale } from "./config";

const loaders = {
  en: () => import("./dictionaries/en").then((module) => module.default),
  "zh-CN": () => import("./dictionaries/zh-CN").then((module) => module.default),
};

export function getDictionary(locale: PublishedLocale) {
  return loaders[locale]();
}
