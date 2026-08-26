import type { Metadata } from "next";

import { FileWorkspace } from "@/components/file-workspace";

export const metadata: Metadata = {
  title: "打开文件",
  description: "在浏览器本地选择并预览文件。",
};

export default function ViewerPage() {
  return (
    <section className="bg-muted py-8 sm:py-12">
      <div className="content-shell flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">LOCAL WORKSPACE</p>
          <h1 className="display-title text-4xl sm:text-5xl">本地文件查看器</h1>
          <p className="text-muted-foreground">选择文件或文件夹。内容只在这个浏览器标签页中读取。</p>
        </div>
        <FileWorkspace />
      </div>
    </section>
  );
}
