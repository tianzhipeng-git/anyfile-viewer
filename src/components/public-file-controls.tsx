"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IsolationBoundaryLink } from "@/components/isolation-boundary-link";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { publicFileLinks } from "@/lib/public-file";
import type { PublishedLocale } from "@/i18n/config";

export function PublicFileControls({ locale, busy, embedded, onOpen, onCancel }: {
  locale: PublishedLocale;
  busy: boolean;
  embedded: boolean;
  onOpen(value: string): Promise<void>;
  onCancel(): void;
}) {
  const zh = locale === "zh-CN";
  const id = useId();
  const [value, setValue] = useState("");
  const [links, setLinks] = useState<ReturnType<typeof publicFileLinks>>();
  const [copyStatus, setCopyStatus] = useState("");
  const openRef = useRef(onOpen);
  useEffect(() => { openRef.current = onOpen; });
  useEffect(() => {
    const load = () => {
      const file = new URLSearchParams(window.location.hash.slice(1)).get("file");
      if (!file) return;
      setValue(file);
      try { setLinks(publicFileLinks(file, window.location.origin, locale)); } catch { setLinks(undefined); }
      void openRef.current(file);
    };
    load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, [locale]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(zh ? "已复制" : "Copied");
    } catch { setCopyStatus(zh ? "请选中代码后复制。" : "Select the code to copy it."); }
  }

  if (embedded) return <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-2 text-sm">
    <span>Anyfile</span>
    <span className="text-muted-foreground">{zh ? "部分格式需要在新窗口打开。" : "Some formats need a separate window."}</span>
    <a href={links?.link ?? `/${locale}/view`} target="_blank" rel="noreferrer noopener" className="underline">{zh ? "在新窗口打开" : "Open in new window"}</a>
    {busy && <Button size="sm" variant="outline" onClick={onCancel}>{zh ? "取消下载" : "Cancel download"}</Button>}
  </div>;

  return <details className="border-t p-3 text-sm">
    <summary className="cursor-pointer font-medium">{zh ? "公开 URL、按钮与嵌入" : "Public URL, button & embed"}</summary>
    <p className="mt-3"><IsolationBoundaryLink href={`/${locale}/integrations`} className="underline">{zh ? "集成与嵌入说明" : "Integration & embedding guide"}</IsolationBoundaryLink></p>
    <form className="mt-3" onSubmit={(event) => {
      event.preventDefault();
      setCopyStatus("");
      try { setLinks(publicFileLinks(value, window.location.origin, locale)); } catch { setLinks(undefined); }
      void onOpen(value);
    }}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-url`}>{zh ? "公开文件 URL" : "Public file URL"}</FieldLabel>
          <Input id={`${id}-url`} type="url" required value={value} onChange={(event) => { setValue(event.target.value); setLinks(undefined); }} placeholder="https://example.org/data/file.csv" />
          <FieldDescription>{zh ? "支持任意公开 HTTPS 文件直链。来源需允许 CORS，最大 128 MiB。仅单文件；不读取关联资源。" : "Any public HTTPS file URL. CORS required; up to 128 MiB. Single files only; related resources are not fetched."}</FieldDescription>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy}>{zh ? "打开 URL / 生成代码" : "Open URL / generate code"}</Button>
          {busy && <Button type="button" variant="outline" size="sm" onClick={onCancel}>{zh ? "取消下载" : "Cancel download"}</Button>}
        </div>
        <FieldDescription>{zh ? "链接只引用已有公开文件，不会上传或分享本地文件。不支持登录、令牌、查询参数或重定向地址。" : "Links reference existing public files; local files are never uploaded or shared. Login, tokens, query strings and redirects are unsupported."}</FieldDescription>
        {links && Object.entries(links).map(([key, text]) => <Field key={key}>
          <FieldLabel htmlFor={`${id}-${key}`}>{key === "link" ? (zh ? "预览链接" : "Preview link") : key === "markdown" ? "README Markdown" : "iframe HTML"}</FieldLabel>
          <Textarea id={`${id}-${key}`} readOnly value={text} onFocus={(event) => event.currentTarget.select()} />
          <Button size="sm" variant="outline" type="button" onClick={() => void copy(text)}>{zh ? "复制" : "Copy"}</Button>
        </Field>)}
        <p role="status">{copyStatus}</p>
      </FieldGroup>
    </form>
  </details>;
}
