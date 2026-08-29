import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon, CheckIcon, LockKeyholeIcon, ZapIcon } from "lucide-react";

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
import { categories, formats, getCategory, getFormat } from "@/lib/catalog";

type FormatPageProps = { params: Promise<{ extension: string }> };

export function generateStaticParams() {
  return formats.map(({ extension }) => ({ extension }));
}

export async function generateMetadata({ params }: FormatPageProps): Promise<Metadata> {
  const format = getFormat((await params).extension);
  return format ? { title: `${format.name}查看器`, description: `在浏览器本地查看 ${format.name}。${format.description}` } : {};
}

export default async function FormatPage({ params }: FormatPageProps) {
  const format = getFormat((await params).extension);
  if (!format) notFound();
  const category = getCategory(format.category) ?? categories[0];

  return (
    <>
      <section className="bg-background py-14 sm:py-20">
        <div className="content-shell flex flex-col gap-10">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink render={<Link href="/" />}>首页</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink render={<Link href={`/categories/${category.slug}`} />}>{category.name}</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{format.name}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div className="flex flex-col items-start gap-6">
              <Badge variant="secondary">.{format.extension} · {format.native ? "浏览器原生查看" : "专用插件查看"}</Badge>
              <div className="flex flex-col gap-4">
                <h1 className="display-title text-5xl leading-none sm:text-6xl">{format.name}，打开就看。</h1>
                <p className="max-w-2xl text-xl leading-8 text-muted-foreground">{format.description} 文件不上传，预览过程仅发生在你的浏览器中。</p>
              </div>
              <Button nativeButton={false} size="lg" render={<IsolationBoundaryLink href="/view" />}>
                选择 .{format.extension} 文件
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
            <FormatGlyph category={format.category} extension={format.extension} />
          </div>
        </div>
      </section>

      <section className="bg-foreground py-16 text-background sm:py-20">
        <div className="content-shell grid gap-8 sm:grid-cols-3">
          {[
            { icon: ZapIcon, title: "更快", text: "跳过文件上传与云端处理队列。" },
            { icon: LockKeyholeIcon, title: "更私密", text: "文件内容不会发送到 Anyfile 服务器。" },
            { icon: CheckIcon, title: "更简单", text: "无需安装桌面软件，也无需注册账户。" },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex flex-col gap-4">
              <Icon className="size-6 text-primary" aria-hidden="true" />
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="leading-7 opacity-65">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
