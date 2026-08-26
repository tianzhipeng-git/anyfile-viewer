import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileCategory } from "@/lib/catalog";

export function CategoryCard({ category }: { category: FileCategory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{category.name}</CardTitle>
        <CardDescription>{category.description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button nativeButton={false} variant="link" render={<Link href={`/categories/${category.slug}`} />}>
          浏览 {category.extensions.length} 种格式
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}
