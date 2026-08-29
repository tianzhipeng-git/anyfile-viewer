"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { crossesIsolationBoundary } from "@/lib/isolation-navigation";

type IsolationBoundaryLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
};

export function IsolationBoundaryLink({ href, ...props }: IsolationBoundaryLinkProps) {
  const pathname = usePathname();

  if (crossesIsolationBoundary(pathname, href)) return <a href={href} {...props} />;
  return <Link href={href} {...props} />;
}
