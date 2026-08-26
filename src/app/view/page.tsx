import type { Metadata } from "next";

import { FileWorkspace } from "@/components/file-workspace";

export const metadata: Metadata = {
  title: "打开文件",
  description: "在浏览器本地选择并预览文件。",
};

export default function ViewerPage() {
  return (
    <section className="viewer-page flex min-h-0 flex-1 bg-muted">
      <FileWorkspace />
    </section>
  );
}
