"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  LockKeyholeIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
  directoryHandleEntries,
  fileHandleEntries,
  isAbortError,
  type WorkspaceTreeEntry,
} from "@/lib/file-system-access";
import { cn } from "@/lib/utils";

const TEXT_PREVIEW_BYTES = 200_000;
const textExtensions = new Set(["txt", "md", "json", "csv", "xml", "yaml", "yml", "html", "css", "js", "ts", "tsx", "log"]);

function extensionOf(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || textExtensions.has(extensionOf(file));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function FileWorkspace() {
  const readRequestId = useRef(0);
  const [entries, setEntries] = useState<WorkspaceTreeEntry[]>([]);
  const [workspaceName, setWorkspaceName] = useState("文件");
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceTreeEntry>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [textPreview, setTextPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const previewUrl = useMemo(
    () => (selectedFile ? URL.createObjectURL(selectedFile) : ""),
    [selectedFile],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function selectEntry(entry: WorkspaceTreeEntry) {
    if (entry.kind !== "file") return;
    const requestId = ++readRequestId.current;
    setSelectedEntry(entry);
    setSelectedFile(undefined);
    setTextPreview("");
    setError("");
    setBusy(true);

    try {
      const file = await entry.handle.getFile();
      if (requestId !== readRequestId.current) return;
      setSelectedFile(file);

      if (isTextFile(file)) {
        const preview = await file.slice(0, TEXT_PREVIEW_BYTES).text();
        if (requestId !== readRequestId.current) return;
        setTextPreview(preview);
      }
    } catch (readError) {
      if (requestId === readRequestId.current) {
        setError(readError instanceof Error ? readError.message : "无法读取所选文件。请重新授权后再试。");
      }
    } finally {
      if (requestId === readRequestId.current) setBusy(false);
    }
  }

  async function loadFileHandles(handles: FileSystemFileHandle[]) {
    const nextEntries = fileHandleEntries(handles);
    setEntries(nextEntries);
    setWorkspaceName(handles.length === 1 ? handles[0].name : `${handles.length} 个文件`);
    if (nextEntries[0]) await selectEntry(nextEntries[0]);
  }

  async function loadDirectoryHandle(handle: FileSystemDirectoryHandle) {
    setBusy(true);
    setError("");
    try {
      const nextEntries = await directoryHandleEntries(handle);
      setEntries(nextEntries);
      setWorkspaceName(handle.name);
      const firstFile = nextEntries.find((entry) => entry.kind === "file");
      if (firstFile) await selectEntry(firstFile);
    } catch (directoryError) {
      setError(directoryError instanceof Error ? directoryError.message : "无法读取所选文件夹。请重新授权后再试。");
    } finally {
      setBusy(false);
    }
  }

  function checkSecureContext() {
    if (!window.isSecureContext) {
      setError("File System Access API 只能在安全上下文中使用。请通过 HTTPS 或 localhost 访问。");
      return false;
    }
    return true;
  }

  async function openFiles() {
    if (!checkSecureContext()) return;
    if (typeof window.showOpenFilePicker !== "function") {
      setError("当前浏览器不支持 showOpenFilePicker()。请使用最新版 Chrome、Edge 或其他兼容的 Chromium 浏览器。");
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({ id: "anyfile-files", multiple: true });
      await loadFileHandles(handles);
    } catch (pickerError) {
      if (!isAbortError(pickerError)) setError(pickerError instanceof Error ? pickerError.message : "无法打开文件选择器。");
    }
  }

  async function openDirectory() {
    if (!checkSecureContext()) return;
    if (typeof window.showDirectoryPicker !== "function") {
      setError("当前浏览器不支持 showDirectoryPicker()。请使用最新版 Chrome、Edge 或其他兼容的 Chromium 浏览器。");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: "anyfile-workspace", mode: "read" });
      await loadDirectoryHandle(handle);
    } catch (pickerError) {
      if (!isAbortError(pickerError)) setError(pickerError instanceof Error ? pickerError.message : "无法打开文件夹选择器。");
    }
  }

  async function acceptDroppedHandles(items: DataTransferItemList) {
    if (!checkSecureContext()) return;
    const itemList = Array.from(items).filter((item) => item.kind === "file");
    if (!itemList.every((item) => typeof item.getAsFileSystemHandle === "function")) {
      setError("当前浏览器无法从拖放内容取得 FileSystemHandle，请使用上方的打开按钮。");
      return;
    }

    const handles = (await Promise.all(itemList.map((item) => item.getAsFileSystemHandle?.()))).filter(
      (handle): handle is FileSystemHandle => Boolean(handle),
    );
    const directory = handles.find((handle): handle is FileSystemDirectoryHandle => handle.kind === "directory");
    if (directory) {
      await loadDirectoryHandle(directory);
      return;
    }
    await loadFileHandles(handles.filter((handle): handle is FileSystemFileHandle => handle.kind === "file"));
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>无法访问本地文件</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div
        className="grid min-h-[680px] overflow-hidden rounded-2xl bg-background ring-1 ring-foreground/10 lg:grid-cols-[300px_1fr]"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptDroppedHandles(event.dataTransfer.items);
        }}
      >
        <aside className="flex flex-col bg-muted/70 lg:border-r">
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <FolderIcon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{workspaceName}</span>
            </div>
            <Badge variant="secondary">{entries.filter((entry) => entry.kind === "file").length}</Badge>
          </div>
          <Separator />
          <div className="flex flex-wrap gap-2 p-3">
            <Button size="sm" disabled={busy} onClick={() => void openFiles()}>
              <FileIcon data-icon="inline-start" />
              打开文件
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void openDirectory()}>
              <FolderOpenIcon data-icon="inline-start" />
              打开文件夹
            </Button>
          </div>
          <div className="flex flex-1 flex-col gap-1 overflow-auto px-2 pb-3">
            {entries.length ? entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                disabled={entry.kind === "directory"}
                className={cn(
                  "flex items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors disabled:cursor-default",
                  selectedEntry?.id === entry.id ? "bg-background text-foreground" : "text-muted-foreground enabled:hover:bg-background/60 enabled:hover:text-foreground",
                )}
                style={{ paddingLeft: `${12 + entry.depth * 16}px` }}
                onClick={() => void selectEntry(entry)}
              >
                {entry.kind === "directory" ? <FolderIcon className="size-4 shrink-0" aria-hidden="true" /> : <FileIcon className="size-4 shrink-0" aria-hidden="true" />}
                <span className="truncate" title={entry.displayPath}>{entry.name}</span>
              </button>
            )) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><FolderOpenIcon /></EmptyMedia>
                  <EmptyTitle>尚未打开工作区</EmptyTitle>
                  <EmptyDescription>授权文件或文件夹后，这里会显示句柄树。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="flex min-h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{selectedEntry?.displayPath ?? "预览区"}</p>
              {selectedFile && <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)} · {selectedFile.type || "未知类型"}</p>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LockKeyholeIcon className="size-4" aria-hidden="true" />
              FileSystemHandle · 仅读
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-5 sm:p-8">
            <Preview file={selectedFile} url={previewUrl} text={textPreview} busy={busy} onOpen={openFiles} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Preview({ file, url, text, busy, onOpen }: { file?: File; url: string; text: string; busy: boolean; onOpen: () => Promise<void> }) {
  if (!file) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileImageIcon /></EmptyMedia>
          <EmptyTitle>{busy ? "正在读取文件句柄…" : "打开本地文件"}</EmptyTitle>
          <EmptyDescription>通过 File System Access API 授权文件。图片、视频、PDF 和文本可直接预览。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button disabled={busy} onClick={() => void onOpen()}>打开文件</Button></EmptyContent>
      </Empty>
    );
  }

  if (file.type.startsWith("image/")) {
    // The URL references the File snapshot returned by FileSystemFileHandle.getFile().
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={file.name} className="max-h-[560px] max-w-full object-contain" />;
  }
  if (file.type.startsWith("video/")) return <video src={url} controls className="max-h-[560px] max-w-full" />;
  if (file.type === "application/pdf" || extensionOf(file) === "pdf") return <iframe src={url} title={file.name} className="h-[560px] w-full rounded-lg bg-background" />;
  if (isTextFile(file)) return <pre className="min-h-full w-full overflow-auto rounded-lg bg-foreground p-5 font-mono text-xs leading-6 text-background">{text || "正在分片读取…"}</pre>;

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><FileTextIcon /></EmptyMedia>
        <EmptyTitle>已取得只读文件句柄</EmptyTitle>
        <EmptyDescription>当前尚未接入 .{extensionOf(file) || "未知"} 专用查看器插件，文件内容没有上传。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
