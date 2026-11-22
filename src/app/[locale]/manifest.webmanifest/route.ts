import { PUBLISHED_LOCALES, isPublishedLocale } from "@/i18n/config";
import { webAppManifestResponse } from "@/lib/pwa/manifest";

export const dynamic = "force-static";

export function generateStaticParams() {
  return PUBLISHED_LOCALES.map((locale) => ({ locale }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string }> },
) {
  const { locale } = await context.params;
  if (!isPublishedLocale(locale)) {
    return new Response("Not Found", { status: 404 });
  }
  return webAppManifestResponse(locale);
}
