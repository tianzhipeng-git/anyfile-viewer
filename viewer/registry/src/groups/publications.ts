import { chmManifest } from "@anyfile/chm-reader/manifest";
import { comicBookManifest } from "@anyfile/comic-book-reader/manifest";
import { djvuManifest } from "@anyfile/djvu-reader/manifest";
import { epubManifest } from "@anyfile/epub-reader/manifest";
import { fictionBookManifest } from "@anyfile/fictionbook-reader/manifest";
import { mobiManifest } from "@anyfile/mobi-reader/manifest";
import type { ViewerRegistryEntry } from "@anyfile/viewer-protocol";

export const publicationRegistryEntries: readonly ViewerRegistryEntry[] = [
  {
    manifest: comicBookManifest,
    async probe(context) { return (await import("@anyfile/comic-book-reader/probe")).probeComicBook(context); },
  },
  {
    manifest: mobiManifest,
    async probe(context) { return (await import("@anyfile/mobi-reader/probe")).probeMobi(context); },
  },
  {
    manifest: fictionBookManifest,
    async probe(context) { return (await import("@anyfile/fictionbook-reader/probe")).probeFictionBook(context); },
  },
  {
    manifest: epubManifest,
    async probe(context) { return (await import("@anyfile/epub-reader/probe")).probeEpub(context); },
  },
  {
    manifest: chmManifest,
    async probe(context) { return (await import("@anyfile/chm-reader/probe")).probeChm(context); },
  },
  {
    manifest: djvuManifest,
    async probe(context) { return (await import("@anyfile/djvu-reader/probe")).probeDjvu(context); },
  },
];
