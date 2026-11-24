import type { FileSource } from "@/lib/analytics/events";
import type { WorkspaceTreeEntry } from "@/lib/file-system-access";

// In-memory handoff for the /view workspace so a client-side language switch
// (soft navigation) keeps the opened file and the loaded tree. File and
// FileSystemHandle references survive in the same JS context; a full document
// reload would drop them, which is why the language switcher navigates softly.
export type WorkspaceSession = {
  entries: WorkspaceTreeEntry[];
  rootDirectory?: FileSystemDirectoryHandle;
  selectedEntry?: WorkspaceTreeEntry;
  selectedFile?: File;
  fileSource: FileSource;
  sidebarWidth?: number;
};

let session: WorkspaceSession | undefined;

export function readWorkspaceSession(): WorkspaceSession | undefined {
  return session;
}

export function writeWorkspaceSession(next: WorkspaceSession) {
  session = next;
}

export function clearWorkspaceSession() {
  session = undefined;
}
