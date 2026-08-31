import type { PublishedLocale } from "../i18n/config";

export type PublishStatus = "draft" | "published";
export type Localized<T> = Readonly<Record<PublishedLocale, T>>;
export type Faq = { question: string; answer: string };

export type FormatCopy = {
  name: string;
  title: string;
  description: string;
  introduction: string;
  canShow: readonly string[];
  limitations: readonly string[];
  faq: readonly Faq[];
};

export type FormatContent = {
  extension: string;
  categoryId: string;
  status: PublishStatus;
  capability: {
    typicalLevel: 1 | 2 | 3 | 4 | 5;
    possibleLevels?: readonly (1 | 2 | 3 | 4 | 5)[];
    conditions?: Localized<readonly string[]>;
    verification: "pending" | "verified";
  };
  alternatives?: readonly {
    name: string;
    url: string;
    reason: Localized<string>;
  }[];
  copy: Localized<FormatCopy>;
};

export type CategoryCopy = {
  name: string;
  eyebrow: string;
  title: string;
  description: string;
  introduction: string;
  useCases: readonly string[];
  commonProblems: readonly string[];
  faq: readonly Faq[];
};

export type CategoryContent = {
  slug: string;
  status: PublishStatus;
  copy: Localized<CategoryCopy>;
};

export type UpstreamProject = {
  name: string;
  version: string;
  projectUrl: string;
  license: string;
  noticeUrl?: string;
  usage: Localized<string>;
};

export type PluginCopy = {
  title: string;
  description: string;
  summary: string;
  architecture: readonly string[];
  limitations: readonly string[];
};

export type PluginContent = {
  pluginId: string;
  status: PublishStatus;
  copy: Localized<PluginCopy>;
  upstreamProjects: readonly UpstreamProject[];
};
