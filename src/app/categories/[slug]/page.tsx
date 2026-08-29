import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";

import { FormatGlyph } from "@/components/format-glyph";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { categories, getCategory, getCategoryFormats } from "@/lib/catalog";

type CategoryPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return categories.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const category = getCategory((await params).slug);
  return category ? { title: category.name, description: category.description } : {};
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const category = getCategory((await params).slug);
  if (!category) notFound();
  const categoryFormats = getCategoryFormats(category.slug);

  return (
    <>
      <section className="bg-background py-14 sm:py-20">
        <div className="content-shell flex flex-col gap-10">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink render={<Link href="/" />}>首页</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{category.name}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex max-w-3xl flex-col gap-5">
            <p className="text-sm font-semibold text-primary">{category.eyebrow}</p>
            <h1 className="display-title text-5xl sm:text-6xl">{category.name}查看器</h1>
            <p className="text-xl leading-8 text-muted-foreground">{category.description} 所有处理都在当前设备完成。</p>
          </div>
        </div>
      </section>

      <section className="bg-muted py-16 sm:py-20">
        <div className="content-shell flex flex-col gap-8">
          <div className="flex items-end justify-between gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-primary">{categoryFormats.length} FORMATS</p>
              <h2 className="display-title text-3xl sm:text-4xl">选择一种文件格式</h2>
            </div>
            <Button nativeButton={false} variant="outline" render={<IsolationBoundaryLink href="/view" />}>直接打开文件</Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categoryFormats.map((format) => (
              <Card key={format.extension}>
                <CardContent><FormatGlyph category={format.category} extension={format.extension} /></CardContent>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{format.name}</CardTitle>
                    <Badge variant={format.native ? "secondary" : "outline"}>{format.native ? "浏览器原生" : "插件"}</Badge>
                  </div>
                  <CardDescription>{format.description}</CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button nativeButton={false} variant="link" render={<Link href={`/formats/${format.extension}`} />}>
                    了解并打开
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
