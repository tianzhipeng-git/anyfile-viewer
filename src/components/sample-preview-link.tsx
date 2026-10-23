"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { localePath, type PublishedLocale } from "../i18n/config";
import { publicFileLinks } from "../lib/public-file";

const subscribe = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => null;

type SamplePreviewLinkProps = Omit<ComponentProps<"a">, "href"> & {
  locale: PublishedLocale;
  extension: string;
  samplePath: string;
};

export function SamplePreviewLink({ locale, extension, samplePath, ...props }: SamplePreviewLinkProps) {
  const origin = useSyncExternalStore<string | null>(subscribe, browserOrigin, serverOrigin);
  const query = new URLSearchParams({ entry: localePath(locale, `/formats/${extension}`) });
  let href = `${localePath(locale, "/view")}?${query}`;
  if (origin) {
    const preview = new URL(publicFileLinks(new URL(samplePath, origin).href, origin, locale).link);
    href += preview.hash;
  }
  // A document navigation establishes the viewer's cross-origin isolation.
  return <a href={href} {...props} />;
}
