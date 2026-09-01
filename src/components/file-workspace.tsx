"use client";

import { useMemo, useRef, useState } from "react";
import { formatNumber, interpolate } from "@anyfile/i18n";
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
import {
  createMemoryWorkspaceReader,
  createWorkspaceReader,
  duplicateWorkspaceFileName,
} from "@/lib/workspace-reader";
import type { PublishedLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/types";

function formatBytes(bytes: number, locale: PublishedLocale) {
  if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
  if (bytes < 1024 ** 2) return `${formatNumber(bytes / 1024, locale, { maximumFractionDigits: 1 })} KB`;
  return `${formatNumber(bytes / 1024 ** 2, locale, { maximumFractionDigits: 1 })} MB`;
}

export function FileWorkspace({ locale, dictionary }: { locale: PublishedLocale; dictionary: AppDictionary }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readRequestId = useRef(0);
  const [entries, setEntries] = useState<WorkspaceTreeEntry[]>([]);
  const [workspaceName, setWorkspaceName] = useState(dictionary.workspace.files);
  const [rootDirectory, setRootDirectory] = useState<FileSystemDirectoryHandle>();
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceTreeEntry>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const workspace = useMemo(
    () => rootDirectory
      ? createWorkspaceReader(rootDirectory, selectedEntry)
      : createMemoryWorkspaceReader(entries, selectedEntry),
    [entries, rootDirectory, selectedEntry],
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

    } catch {
      if (requestId === readRequestId.current) {
        setError(dictionary.workspace.readFileFailed);
      }
    } finally {
      if (requestId === readRequestId.current) setBusy(false);
    }
  }

  async function loadFileHandles(handles: FileSystemFileHandle[]) {
    setError("");
    const nextEntries = fileHandleEntries(handles);
    if (duplicateWorkspaceFileName(nextEntries)) {
      setError(dictionary.workspace.duplicateFileNames);
      return;
    }
    setRootDirectory(undefined);
    setEntries(nextEntries);
    setWorkspaceName(handles.length === 1 ? handles[0].name : interpolate(dictionary.workspace.fileCount, { count: formatNumber(handles.length, locale) }));
    if (nextEntries[0]) await selectEntry(nextEntries[0]);
  }

  async function loadBrowserFiles(files: File[]) {
    setError("");
    const nextEntries = browserFileEntries(files);
    if (duplicateWorkspaceFileName(nextEntries)) {
      setError(dictionary.workspace.duplicateFileNames);
      return;
    }
    setRootDirectory(undefined);
    setEntries(nextEntries);
    setWorkspaceName(files.length === 1 ? files[0].name : interpolate(dictionary.workspace.fileCount, { count: formatNumber(files.length, locale) }));
    if (nextEntries[0]) await selectEntry(nextEntries[0]);
  }

  async function loadDirectoryHandle(handle: FileSystemDirectoryHandle) {
    readRequestId.current += 1;
    setSelectedEntry(undefined);
    setSelectedFile(undefined);
    setBusy(true);
    setError("");
    try {
      const nextEntries = await directoryHandleEntries(handle, locale);
      setRootDirectory(handle);
      setEntries(nextEntries);
      setWorkspaceName(handle.name);
      const firstFile = nextEntries.find((entry) => entry.kind === "file");
      if (firstFile) await selectEntry(firstFile);
    } catch {
      setError(dictionary.workspace.readFolderFailed);
    } finally {
      setBusy(false);
    }
  }

  async function expandDirectory(entry: Extract<WorkspaceTreeEntry, { kind: "directory" }>) {
    try {
      const children = await directoryHandleChildren(entry, locale);
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
    } catch {
      setError(dictionary.workspace.readFolderFailed);
    }
  }

  function checkSecureContext() {
    if (!window.isSecureContext) {
      setError(dictionary.workspace.secureContext);
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
      setError(dictionary.workspace.folderUnsupported);
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: "anyfile-workspace", mode: "read" });
      await loadDirectoryHandle(handle);
    } catch (pickerError) {
      if (!isAbortError(pickerError)) setError(dictionary.workspace.pickerFailed);
    }
  }

  async function acceptDroppedHandles(items: DataTransferItemList) {
    const itemList = Array.from(items).filter((item) => item.kind === "file");
    if (!itemList.every((item) => typeof item.getAsFileSystemHandle === "function")) {
      const files = itemList.map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (files.length) await loadBrowserFiles(files);
      else setError(dictionary.workspace.droppedEmpty);
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
    else setError(dictionary.workspace.droppedEmpty);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{dictionary.workspace.accessErrorTitle}</AlertTitle>
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
                aria-label={dictionary.workspace.collapseSidebar}
                title={dictionary.workspace.collapseSidebar}
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
              aria-label={dictionary.workspace.chooseLocalFile}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (files.length) void loadBrowserFiles(files);
              }}
            />
            <Button size="sm" disabled={busy} onClick={() => void openFiles()}>
              <FileIcon data-icon="inline-start" />
              {dictionary.common.openFile}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void openDirectory()}>
              <FolderOpenIcon data-icon="inline-start" />
              {dictionary.common.openFolder}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
            {entries.length ? (
              <FileTree
                entries={entries}
                selectedId={selectedEntry?.id}
                onSelect={(entry) => void selectEntry(entry)}
                onExpand={expandDirectory}
                ariaLabel={dictionary.workspace.workspaceFiles}
              />
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><FolderOpenIcon /></EmptyMedia>
                  <EmptyTitle>{dictionary.workspace.unopenedTitle}</EmptyTitle>
                  <EmptyDescription>{dictionary.workspace.unopenedDescription}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="relative flex flex-1 items-stretch overflow-hidden bg-muted/30">
            <ViewerHost
              locale={locale}
              dictionary={dictionary.viewer}
              file={selectedFile}
              relativePath={selectedEntry?.relativePath}
              workspace={workspace}
              header={(
                <div className="flex min-w-0 items-center gap-2">
                  {!sidebarOpen && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={dictionary.workspace.expandSidebar}
                      title={dictionary.workspace.expandSidebar}
                      onClick={() => setSidebarOpen(true)}
                    >
                      <PanelLeftOpenIcon />
                    </Button>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedEntry?.displayPath ?? dictionary.workspace.preview}</p>
                    {selectedFile && <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size, locale)} · {selectedFile.type || dictionary.workspace.unknownType}</p>}
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
