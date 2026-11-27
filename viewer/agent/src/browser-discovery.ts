import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { AgentError } from "@anyfile/viewer-protocol";

export interface BrowserDiscoveryOptions {
  readonly envPath?: string;
  readonly candidates?: readonly string[];
  readonly searchPathEnv?: string;
  readonly platform?: NodeJS.Platform;
}

function isExecutableFile(candidate: string): boolean {
  try {
    const info = statSync(candidate);
    if (!info.isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function platformCandidates(platform: NodeJS.Platform): string[] {
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    ];
  }
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const programFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";
    return [
      join(programFiles, "Google\\Chrome\\Application\\chrome.exe"),
      join(programFilesX86, "Google\\Chrome\\Application\\chrome.exe"),
      join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
      join(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
      join(programFilesX86, "Microsoft\\Edge\\Application\\msedge.exe"),
      join(programFiles, "BraveSoftware\\Brave-Browser\\Application\\brave.exe"),
    ];
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
    "/snap/bin/chromium",
  ];
}

const PATH_BINARIES = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
  "brave-browser",
];

/**
 * Discovers a locally installed Chromium-based browser executable.
 * Honors `ANYFILE_BROWSER_PATH` first; never downloads a browser.
 */
export function discoverBrowserExecutable(options: BrowserDiscoveryOptions = {}): string {
  const envPath = (options.envPath ?? process.env.ANYFILE_BROWSER_PATH ?? "").trim();
  if (envPath) {
    if (isExecutableFile(envPath)) return envPath;
    throw new AgentError(
      "runtime-unavailable",
      `Browser executable configured by ANYFILE_BROWSER_PATH does not exist or is not executable: ${envPath}`,
    );
  }

  const platform = options.platform ?? process.platform;
  const candidates = options.candidates ?? platformCandidates(platform);
  for (const candidate of candidates) {
    if (candidate && isExecutableFile(candidate)) return candidate;
  }

  const searchPath = options.searchPathEnv ?? process.env.PATH ?? "";
  if (searchPath) {
    const dirs = searchPath.split(delimiter).filter(Boolean);
    for (const dir of dirs) {
      for (const bin of PATH_BINARIES) {
        const full = join(dir, platform === "win32" ? `${bin}.exe` : bin);
        if (isExecutableFile(full)) return full;
      }
    }
  }

  throw new AgentError(
    "runtime-unavailable",
    "No local Chromium-based browser (Chrome, Edge, Brave, Chromium) was found for visual rendering. Install one or set ANYFILE_BROWSER_PATH.",
  );
}
