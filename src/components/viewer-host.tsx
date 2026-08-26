"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon, FileSearchIcon, LoaderCircleIcon } from "lucide-react";
import {
  ViewerError,
  findViewerRegistrations,
  isViewerAbortError,
  normalizeViewerError,
  validateLoadedPlugin,
  type ViewerController,
  type WorkspaceReader,
} from "@anyfile/viewer-protocol";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { viewerRegistrations } from "@/lib/viewer-registrations";

type ViewerSession = { stop(): Promise<void> };
type ViewerStatus = "idle" | "loading" | "active" | "error";

export function ViewerHost({
  file,
  relativePath,
  workspace,
}: {
  file?: File;
  relativePath?: string;
  workspace?: WorkspaceReader;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ViewerSession | undefined>(undefined);
  const [registrationId, setRegistrationId] = useState("");
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [message, setMessage] = useState("");
  const candidates = useMemo(
    () => file ? findViewerRegistrations(file.name, viewerRegistrations) : [],
    [file],
  );
  const registration = candidates.find(({ manifest }) => manifest.id === registrationId) ?? candidates[0];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previousSession = sessionRef.current;

    if (!file || !registration) {
      sessionRef.current = undefined;
      void previousSession?.stop().then(() => {
        if (!sessionRef.current) container.replaceChildren();
      });
      return;
    }

    const abortController = new AbortController();
    let controller: ViewerController | undefined;
    let stopOperation: Promise<void> | undefined;
    const session: ViewerSession = {
      stop() {
        if (!stopOperation) {
          stopOperation = (async () => {
            abortController.abort();
            await operation.catch(() => undefined);
            await controller?.dispose();
            if (sessionRef.current === session) {
              container.replaceChildren();
            }
          })();
        }
        return stopOperation;
      },
    };
    sessionRef.current = session;

    const operation = (async () => {
      await previousSession?.stop();
      if (abortController.signal.aborted) return;
      container.replaceChildren();
      setStatus("loading");
      setMessage(`正在加载${registration.manifest.name}…`);

      if (registration.manifest.workspaceAccess === "required" && !workspace) {
        throw new ViewerError("missing-related-file", "此查看器需要从文件夹工作区打开文件。");
      }
      const plugin = await registration.load();
      validateLoadedPlugin(registration, plugin);
      if (abortController.signal.aborted) return;
      controller = await plugin.open({
        file,
        relativePath,
        workspace,
        container,
        signal: abortController.signal,
        locale: navigator.language || "zh-CN",
        reportProgress(progress) {
          if (!abortController.signal.aborted && sessionRef.current === session) {
            setMessage(progress.message ?? progress.stage);
          }
        },
      });
      if (!abortController.signal.aborted && sessionRef.current === session) {
        setStatus("active");
      }
    })().catch((error: unknown) => {
      if (abortController.signal.aborted || isViewerAbortError(error)) return;
      container.replaceChildren();
      if (sessionRef.current === session) {
        const viewerError = normalizeViewerError(error);
        setStatus("error");
        setMessage(viewerError.message);
      }
    });

    return () => {
      void session.stop();
    };
  }, [file, registration, relativePath, workspace]);

  const visibleStatus = !file || !registration ? "idle" : status;
  const visibleMessage = visibleStatus === "idle" ? "" : message;

  return (
    <div className="flex min-h-0 w-full flex-col">
      {candidates.length > 1 && (
        <div className="flex items-center justify-end border-b bg-background px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            查看器
            <select
              className="h-8 rounded-md border bg-background px-2 text-foreground"
              value={registration?.manifest.id ?? ""}
              onChange={(event) => setRegistrationId(event.target.value)}
            >
              {candidates.map(({ manifest }) => (
                <option key={manifest.id} value={manifest.id}>{manifest.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div
        ref={containerRef}
        className="viewer-container min-h-0 flex-1 overflow-auto"
        style={{
          "--viewer-background": "var(--background)",
          "--viewer-foreground": "var(--foreground)",
          "--viewer-border": "var(--border)",
          "--viewer-accent": "var(--primary)",
          "--viewer-font-family": "var(--font-system)",
        } as React.CSSProperties}
      />
      {visibleStatus !== "active" && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {visibleStatus === "loading" ? <LoaderCircleIcon className="animate-spin" /> : visibleStatus === "error" ? <AlertCircleIcon /> : <FileSearchIcon />}
              </EmptyMedia>
              <EmptyTitle>{visibleStatus === "loading" ? "正在打开文件" : visibleStatus === "error" ? "查看器打开失败" : file ? "没有匹配的查看器" : "选择本地文件"}</EmptyTitle>
              <EmptyDescription>
                {visibleMessage || (file ? `当前没有支持 ${file.name.split(".").pop()?.toLowerCase() || "未知"} 格式的插件。` : "目前支持 PDF、XLSX 与 XLSM，内容只在浏览器本地处理。")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
    </div>
  );
}
