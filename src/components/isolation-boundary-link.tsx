"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { safePath } from "@/lib/analytics/events";
import { crossesIsolationBoundary } from "@/lib/isolation-navigation";

type IsolationBoundaryLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
};

export function IsolationBoundaryLink({ href, ...props }: IsolationBoundaryLinkProps) {
  const pathname = usePathname();

  if (/^\/(en|zh-CN)\/view$/.test(href) && !/^\/(en|zh-CN)\/view$/.test(pathname)) {
    href += `?entry=${encodeURIComponent(safePath(pathname))}`;
  }

  if (crossesIsolationBoundary(pathname, href)) return <a href={href} {...props} />;
  return <Link href={href} {...props} />;
}
