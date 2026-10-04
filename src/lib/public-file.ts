import type { PublishedLocale } from "../i18n/config";

export const PUBLIC_FILE_LIMIT = 128 * 1024 ** 2;
export type PublicFileErrorCode = "invalid-url" | "resource-limit" | "fetch-failed";
export class PublicFileError extends Error {
  constructor(readonly code: PublicFileErrorCode) { super(code); }
}

// Start with public, anonymous sources. Never forward cookies or authentication.
export function publicFileUrl(value: string, origin: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new PublicFileError("invalid-url"); }
  const ownSample = url.origin === origin && url.pathname.startsWith("/samples/");
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !ownSample)) {
    throw new PublicFileError("invalid-url");
  }
  let name: string;
  try { name = decodeURIComponent(url.pathname.split("/").pop() ?? ""); } catch { throw new PublicFileError("invalid-url"); }
  if (!name || /[/\\\x00-\x1f]/.test(name)) throw new PublicFileError("invalid-url");
  return url;
}

export async function downloadPublicFile(value: string, origin: string, signal: AbortSignal): Promise<File> {
  const url = publicFileUrl(value, origin);
  const response = await fetch(url, { signal, mode: "cors", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
  if (!response.ok || !response.body) throw new PublicFileError("fetch-failed");
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get("content-length")) > PUBLIC_FILE_LIMIT) throw new PublicFileError("resource-limit");
    while (true) {
      signal.throwIfAborted();
      const { value: chunk, done } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > PUBLIC_FILE_LIMIT) throw new PublicFileError("resource-limit");
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    return new File(chunks, decodeURIComponent(url.pathname.split("/").pop()!), { type: response.headers.get("content-type")?.split(";")[0] ?? "" });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function publicFileLinks(value: string, origin: string, locale: PublishedLocale) {
  const file = publicFileUrl(value, origin).href;
  const fragment = new URLSearchParams({ file }).toString();
  const link = `${origin}/${locale}/view#${fragment}`;
  const embed = `${origin}/${locale}/embed#${fragment}`;
  const badge = `${origin}/brand/open-in-anyfile.svg`;
  return {
    link,
    markdown: `[![Open in Anyfile](${badge})](${link})`,
    iframe: `<iframe src="${embed}" title="Anyfile file preview" width="100%" height="600" style="border:0" loading="lazy" allow="fullscreen; cross-origin-isolated" referrerpolicy="no-referrer"></iframe>`,
  };
}
