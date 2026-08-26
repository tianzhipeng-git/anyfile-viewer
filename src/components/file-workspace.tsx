"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  LockKeyholeIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { ViewerHost } from "@/components/viewer-host";
import {
  browserFileEntries,
  directoryHandleEntries,
  fileHandleEntries,
  isAbortError,
  type WorkspaceTreeEntry,
} from "@/lib/file-system-access";
import { cn } from "@/lib/utils";
import { createWorkspaceReader } from "@/lib/workspace-reader";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function FileWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readRequestId = useRef(0);
  const [entries, setEntries] = useState<WorkspaceTreeEntry[]>([]);
  const [workspaceName, setWorkspaceName] = useState("文件");
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceTreeEntry>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const workspace = useMemo(
    () => createWorkspaceReader(entries, selectedEntry),
    [entries, selectedEntry],
  );

  async function selectEntry(entry: WorkspaceTreeEntry) {
    if (entry.kind !== "file") return;
    const requestId = ++readRequestId.current;
    setSelectedEntry(entry);
    setSelectedFile(undefined);
    setError("");
    setBusy(true);

    try {
      const file = entry.file ?? await entry.handle.getFile();
      if (requestId !== readRequestId.current) return;
      setSelectedFile(file);

    } catch (readError) {
      if (requestId === readRequestId.current) {
        setError(readError instanceof Error ? readError.message : "无法读取所选文件。请重新授权后再试。");
      }
    } finally {
      if (requestId === readRequestId.current) setBusy(false);
    }
  }

  async function loadFileHandles(handles: FileSystemFileHandle[]) {
    setError("");
    const nextEntries = fileHandleEntries(handles);
    setEntries(nextEntries);
    setWorkspaceName(handles.length === 1 ? handles[0].name : `${handles.length} 个文件`);
    if (nextEntries[0]) await selectEntry(nextEntries[0]);
  }

  async function loadBrowserFiles(files: File[]) {
    setError("");
    const nextEntries = browserFileEntries(files);
    setEntries(nextEntries);
    setWorkspaceName(files.length === 1 ? files[0].name : `${files.length} 个文件`);
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
    fileInputRef.current?.click();
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
    const itemList = Array.from(items).filter((item) => item.kind === "file");
    if (!itemList.every((item) => typeof item.getAsFileSystemHandle === "function")) {
      const files = itemList.map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (files.length) await loadBrowserFiles(files);
      else setError("拖放内容中没有可读取的文件。");
      return;
    }
    if (!checkSecureContext()) return;

    const handles = (await Promise.all(itemList.map((item) => item.getAsFileSystemHandle?.()))).filter(
      (handle): handle is FileSystemHandle => Boolean(handle),
    );
    const directory = handles.find((handle): handle is FileSystemDirectoryHandle => handle.kind === "directory");
    if (directory) {
      await loadDirectoryHandle(directory);
      return;
    }
    const files = handles.filter((handle): handle is FileSystemFileHandle => handle.kind === "file");
    if (files.length) await loadFileHandles(files);
    else setError("拖放内容中没有可读取的文件。");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>无法访问本地文件</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div
        className="grid min-h-0 flex-1 overflow-hidden bg-background lg:grid-cols-[300px_1fr]"
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              aria-label="选择本地文件"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (files.length) void loadBrowserFiles(files);
              }}
            />
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
              {selectedEntry?.kind === "file" && selectedEntry.handle ? "FileSystemHandle" : "本地文件"} · 仅读
            </div>
          </div>
          <div className="relative flex flex-1 items-stretch overflow-hidden bg-muted/30">
            <ViewerHost file={selectedFile} relativePath={selectedEntry?.relativePath} workspace={workspace} />
          </div>
        </section>
      </div>
    </div>
  );
}
