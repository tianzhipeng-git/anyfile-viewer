import Link from "next/link";
import { ArrowRightIcon, FolderOpenIcon, LockKeyholeIcon, ZapIcon } from "lucide-react";

import { CategoryCard } from "@/components/category-card";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Button } from "@/components/ui/button";
import { categories } from "@/lib/catalog";

const principles = [
  { icon: LockKeyholeIcon, title: "不上传", description: "文件内容不会离开你的设备，也不经过服务器中转。" },
  { icon: ZapIcon, title: "打开就看", description: "省去上传和下载等待，充分利用浏览器原生解码能力。" },
  { icon: FolderOpenIcon, title: "从文件到文件夹", description: "单个文件快速查看，也支持以工作区方式浏览关联资源。" },
];

export default function Home() {
  return (
    <>
      <section className="bg-background py-24 sm:py-32">
        <div className="content-shell flex max-w-4xl flex-col items-center gap-8 text-center">
          <p className="text-sm font-semibold text-primary">LOCAL-FIRST FILE VIEWER</p>
          <div className="flex flex-col gap-5">
            <h1 className="display-title text-5xl leading-none sm:text-7xl">所有文件，一处打开。</h1>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-muted-foreground sm:text-2xl">
              无需上传。使用浏览器原生能力，在本地快速、安全地查看图片、文档、代码与 3D 文件。
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button nativeButton={false} size="lg" render={<IsolationBoundaryLink href="/view" />}>
              选择本地文件
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button nativeButton={false} size="lg" variant="outline" render={<Link href="#formats" />}>浏览支持格式</Button>
          </div>
          <p className="text-xs text-muted-foreground">本地处理 · 无需注册 · 免费使用</p>
        </div>
      </section>

      <section className="bg-foreground py-20 text-background">
        <div className="content-shell grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-semibold text-primary">PRIVACY BY DEFAULT</p>
            <h2 className="display-title text-4xl leading-tight sm:text-5xl">你的文件，只属于你。</h2>
            <p className="max-w-xl text-lg leading-8 opacity-70">
              Anyfile 直接读取你明确选择的本地文件。预览、解码与渲染全部发生在当前浏览器标签页中。
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl bg-background/10 sm:grid-cols-3">
            {principles.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex flex-col gap-5 bg-foreground p-7">
                <Icon className="size-7 text-primary" aria-hidden="true" />
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="text-sm leading-6 opacity-65">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="formats" className="bg-muted py-20 sm:py-24">
        <div className="content-shell flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="text-sm font-semibold text-primary">SUPPORTED FORMATS</p>
            <h2 className="display-title text-4xl sm:text-5xl">找到你要打开的格式。</h2>
            <p className="text-lg leading-7 text-muted-foreground">从浏览器原生支持到专用查看器插件，统一在清晰的类别中。</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => <CategoryCard key={category.slug} category={category} />)}
          </div>
        </div>
      </section>
    </>
  );
}
