import type { PublishedLocale } from "@/i18n/config";

export const SITE_INFO_SLUGS = ["about", "privacy", "contact"] as const;
export type SiteInfoSlug = (typeof SITE_INFO_SLUGS)[number];

type LocalizedText = Readonly<Record<PublishedLocale, string>>;
type SiteInfoSection = Readonly<{ title: LocalizedText; paragraphs: readonly LocalizedText[] }>;

type SiteInfoPage = Readonly<{
  title: LocalizedText;
  eyebrow: LocalizedText;
  description: LocalizedText;
  sections: readonly SiteInfoSection[];
}>;

const text = (en: string, zhCN: string): LocalizedText => ({ en, "zh-CN": zhCN });

const pages: Record<SiteInfoSlug, SiteInfoPage> = {
  about: {
    title: text("About Anyfile", "关于 Anyfile"),
    eyebrow: text("ABOUT", "关于"),
    description: text(
      "Anyfile is a free, open-source file viewer built to open many kinds of files directly in the browser.",
      "Anyfile 是一个免费、开源的文件查看器，致力于直接在浏览器中打开尽可能多的文件格式。",
    ),
    sections: [
      {
        title: text("Local first", "本地优先"),
        paragraphs: [text(
          "Files you choose are read, decoded and rendered on your device. They are not uploaded to an Anyfile server for conversion or previewing.",
          "你选择的文件会在当前设备上读取、解码和渲染，不会上传到 Anyfile 服务器进行转换或预览。",
        )],
      },
      {
        title: text("Built for viewing", "专注于查看"),
        paragraphs: [text(
          "The project prioritizes broad format coverage, fast startup and useful read-only previews. It does not try to replace full desktop editors.",
          "项目优先追求广泛的格式覆盖、快速启动和实用的只读预览，不以替代完整桌面编辑软件为目标。",
        )],
      },
      {
        title: text("Open source", "开放源代码"),
        paragraphs: [text(
          "The source code is public. You can inspect how the viewers work, report an issue or contribute on GitHub.",
          "项目源代码公开。你可以在 GitHub 查看查看器的实现、报告问题或参与贡献。",
        )],
      },
    ],
  },
  privacy: {
    title: text("Privacy policy", "隐私政策"),
    eyebrow: text("PRIVACY", "隐私"),
    description: text(
      "Anyfile is designed so that the contents of files you open stay on your device.",
      "Anyfile 的设计目标是让你打开的文件内容始终留在自己的设备上。",
    ),
    sections: [
      {
        title: text("Files you open", "你打开的文件"),
        paragraphs: [text(
          "Anyfile reads only files or folders you explicitly select. Previewing happens in your browser. File contents and file names are not uploaded to Anyfile for processing, and Anyfile does not retain a copy after you close or leave the page.",
          "Anyfile 只读取你明确选择的文件或文件夹。预览在浏览器中完成，文件内容和文件名不会上传到 Anyfile 进行处理；关闭或离开页面后，Anyfile 不会保留文件副本。",
        )],
      },
      {
        title: text("Website and performance data", "网站与性能数据"),
        paragraphs: [text(
          "Like most websites, the hosting infrastructure receives ordinary request data such as IP address, browser information and requested pages. Anyfile also uses Vercel Analytics and Speed Insights to understand aggregate usage and page performance. These systems are not given the contents of files you open.",
          "与大多数网站一样，托管基础设施会接收 IP 地址、浏览器信息和所请求页面等常规访问数据。Anyfile 还使用 Vercel Analytics 与 Speed Insights 了解汇总使用情况和页面性能，这些系统不会收到你打开的文件内容。",
        )],
      },
      {
        title: text("External services and links", "外部服务与链接"),
        paragraphs: [text(
          "The site is hosted on Vercel. Some viewers may download code or decoder assets after you choose a format, but the selected file remains in your browser. Following an external link, such as GitHub, is governed by that service's own privacy terms.",
          "本站托管于 Vercel。部分查看器可能会在你选择格式后下载代码或解码器资源，但所选文件仍留在浏览器中。访问 GitHub 等外部链接时，适用对应服务自己的隐私条款。",
        )],
      },
      {
        title: text("Questions and changes", "问题与变更"),
        paragraphs: [text(
          "Anyfile does not provide user accounts or build profiles from the files you view. For privacy questions, contact support@anyfile.top. Material changes to this policy will be published on this page. Effective September 2, 2026.",
          "Anyfile 不提供用户账户，也不会根据你查看的文件建立用户画像。如有隐私问题，请联系 support@anyfile.top。本政策如有重要变更，将在此页面发布。生效日期：2026 年 9 月 2 日。",
        )],
      },
    ],
  },
  contact: {
    title: text("Contact Anyfile", "联系 Anyfile"),
    eyebrow: text("CONTACT", "联系"),
    description: text(
      "Get help, report a problem or suggest support for another file format.",
      "获取帮助、报告问题，或建议支持新的文件格式。",
    ),
    sections: [
      {
        title: text("Email support", "邮件支持"),
        paragraphs: [text(
          "Email support@anyfile.top with a short description of the problem, the file extension and your browser version. Do not attach confidential files; Anyfile support does not need the original file in most cases.",
          "请发送邮件至 support@anyfile.top，并简要说明问题、文件扩展名和浏览器版本。请勿附加机密文件；大多数情况下，Anyfile 支持不需要原始文件。",
        )],
      },
      {
        title: text("GitHub", "GitHub"),
        paragraphs: [text(
          "For reproducible bugs, technical discussions and contributions, visit the open-source repository on GitHub.",
          "对于可复现的 Bug、技术讨论和代码贡献，请访问 GitHub 开源仓库。",
        )],
      },
    ],
  },
};

export function isSiteInfoSlug(value: string): value is SiteInfoSlug {
  return (SITE_INFO_SLUGS as readonly string[]).includes(value);
}

export function getSiteInfoPage(slug: SiteInfoSlug, locale: PublishedLocale) {
  const page = pages[slug];
  return {
    title: page.title[locale],
    eyebrow: page.eyebrow[locale],
    description: page.description[locale],
    sections: page.sections.map((section) => ({
      title: section.title[locale],
      paragraphs: section.paragraphs.map((paragraph) => paragraph[locale]),
    })),
  };
}
