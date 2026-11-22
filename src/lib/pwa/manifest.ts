import { localePath, type PublishedLocale } from "@/i18n/config";
import { buildPwaFileHandlers, type WebAppFileHandler } from "./file-handlers";

export type AnyfileWebAppManifest = {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly lang: PublishedLocale;
  readonly dir: "ltr";
  readonly start_url: string;
  readonly scope: string;
  readonly display: "standalone";
  readonly background_color: string;
  readonly theme_color: string;
  readonly categories: readonly string[];
  readonly icons: readonly {
    readonly src: string;
    readonly sizes: string;
    readonly type: string;
    readonly purpose: "any" | "maskable";
  }[];
  readonly launch_handler: {
    readonly client_mode: readonly string[];
  };
  readonly file_handlers: readonly WebAppFileHandler[];
};

const MANIFEST_DESCRIPTIONS: Record<PublishedLocale, string> = {
  en: "Open documents, images, media, CAD, 3D, ebooks, code and data locally without uploading.",
  "zh-CN": "在本地打开文档、图片、音视频、CAD、3D、电子书、代码与数据文件，无需上传。",
};

export function buildWebAppManifest(locale: PublishedLocale): AnyfileWebAppManifest {
  const viewerUrl = localePath(locale, "/view");
  return {
    id: "/view",
    name: "Anyfile",
    short_name: "Anyfile",
    description: MANIFEST_DESCRIPTIONS[locale],
    lang: locale,
    dir: "ltr",
    start_url: viewerUrl,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1c1c1c",
    categories: ["utilities", "productivity"],
    icons: [
      {
        src: "/brand/anyfile-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/anyfile-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/anyfile-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/anyfile-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    launch_handler: {
      client_mode: ["focus-existing", "auto"],
    },
    file_handlers: buildPwaFileHandlers(viewerUrl),
  };
}

export function webAppManifestResponse(locale: PublishedLocale): Response {
  return new Response(JSON.stringify(buildWebAppManifest(locale)), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
