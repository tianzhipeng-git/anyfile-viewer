import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileCategory } from "@/lib/catalog";
import { localePath, type PublishedLocale } from "@/i18n/config";

export function CategoryCard({ category, locale, browseLabel }: { category: FileCategory; locale: PublishedLocale; browseLabel: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{category.name}</CardTitle>
        <CardDescription>{category.description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button nativeButton={false} variant="link" render={<Link href={localePath(locale, `/categories/${category.slug}`)} />}>
          {browseLabel.replace("{count}", String(category.extensions.length))}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
