"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
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
import { FileTree } from "@/components/file-tree";
import { ViewerHost } from "@/components/viewer-host";
import {
  browserFileEntries,
  directoryHandleChildren,
  directoryHandleEntries,
  fileHandleEntries,
  isAbortError,
  type WorkspaceTreeEntry,
} from "@/lib/file-system-access";
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
  const [rootDirectory, setRootDirectory] = useState<FileSystemDirectoryHandle>();
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceTreeEntry>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const workspace = useMemo(
    () => createWorkspaceReader(rootDirectory, selectedEntry),
    [rootDirectory, selectedEntry],
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
    setRootDirectory(undefined);
    const nextEntries = fileHandleEntries(handles);
    setEntries(nextEntries);
    setWorkspaceName(handles.length === 1 ? handles[0].name : `${handles.length} 个文件`);
    if (nextEntries[0]) await selectEntry(nextEntries[0]);
  }

  async function loadBrowserFiles(files: File[]) {
    setError("");
    setRootDirectory(undefined);
    const nextEntries = browserFileEntries(files);
    setEntries(nextEntries);
    setWorkspaceName(files.length === 1 ? files[0].name : `${files.length} 个文件`);
    if (nextEntries[0]) await selectEntry(nextEntries[0]);
  }

  async function loadDirectoryHandle(handle: FileSystemDirectoryHandle) {
    readRequestId.current += 1;
    setSelectedEntry(undefined);
    setSelectedFile(undefined);
    setBusy(true);
    setError("");
    try {
      const nextEntries = await directoryHandleEntries(handle);
      setRootDirectory(handle);
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

  async function expandDirectory(entry: Extract<WorkspaceTreeEntry, { kind: "directory" }>) {
    try {
      const children = await directoryHandleChildren(entry);
      setEntries((currentEntries) => {
        const directoryIndex = currentEntries.findIndex(
          (current) => current.id === entry.id && current.kind === "directory" && current.handle === entry.handle,
        );
        if (directoryIndex === -1) return currentEntries;
        const loadedDirectory = { ...entry, childrenLoaded: true };
        return [
          ...currentEntries.slice(0, directoryIndex),
          loadedDirectory,
          ...children,
          ...currentEntries.slice(directoryIndex + 1),
        ];
      });
    } catch (directoryError) {
      setError(directoryError instanceof Error ? directoryError.message : "无法读取所选文件夹。请重新授权后再试。");
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
        className={sidebarOpen
          ? "grid min-h-0 flex-1 overflow-hidden bg-background transition-[grid-template-columns] lg:grid-cols-[300px_minmax(0,1fr)]"
          : "grid min-h-0 flex-1 overflow-hidden bg-background transition-[grid-template-columns] lg:grid-cols-[0px_minmax(0,1fr)]"}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void acceptDroppedHandles(event.dataTransfer.items);
        }}
      >
        <aside className={sidebarOpen
          ? "flex min-h-0 flex-col overflow-hidden bg-muted/70 lg:border-r"
          : "hidden min-h-0 flex-col overflow-hidden bg-muted/70 lg:flex"}>
          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <FolderIcon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{workspaceName}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant="secondary">{entries.filter((entry) => entry.kind === "file").length}</Badge>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="收起文件栏"
                title="收起文件栏"
                onClick={() => setSidebarOpen(false)}
              >
                <PanelLeftCloseIcon />
              </Button>
            </div>
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
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
            {entries.length ? (
              <FileTree
                entries={entries}
                selectedId={selectedEntry?.id}
                onSelect={(entry) => void selectEntry(entry)}
                onExpand={expandDirectory}
              />
            ) : (
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
          <div className="relative flex flex-1 items-stretch overflow-hidden bg-muted/30">
            <ViewerHost
              file={selectedFile}
              relativePath={selectedEntry?.relativePath}
              workspace={workspace}
              header={(
                <div className="flex min-w-0 items-center gap-2">
                  {!sidebarOpen && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="展开文件栏"
                      title="展开文件栏"
                      onClick={() => setSidebarOpen(true)}
                    >
                      <PanelLeftOpenIcon />
                    </Button>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedEntry?.displayPath ?? "预览区"}</p>
                    {selectedFile && <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)} · {selectedFile.type || "未知类型"}</p>}
                  </div>
                </div>
              )}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
