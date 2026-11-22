interface OpenFilePickerOptions {
  id?: string;
  multiple?: boolean;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
}

interface LaunchParams {
  readonly targetURL?: string;
  readonly files: readonly FileSystemHandle[];
}

type LaunchConsumer = (params: LaunchParams) => void | Promise<void>;

interface LaunchQueue {
  setConsumer(consumer: LaunchConsumer): void;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface Navigator {
  install?(options?: { manifest: string; manifestId?: string }): Promise<void>;
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  launchQueue?: LaunchQueue;
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}
