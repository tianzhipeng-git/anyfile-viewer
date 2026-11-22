import { chmManifest } from "@anyfile/chm-reader/manifest";
import { comicBookManifest } from "@anyfile/comic-book-reader/manifest";
import { djvuManifest } from "@anyfile/djvu-reader/manifest";
import { epubManifest } from "@anyfile/epub-reader/manifest";
import { fictionBookManifest } from "@anyfile/fictionbook-reader/manifest";
import { mobiManifest } from "@anyfile/mobi-reader/manifest";
import type { ViewerPluginRegistration } from "@anyfile/viewer-protocol";

export const publicationRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: comicBookManifest,
    async probe(context) { return (await import("@anyfile/comic-book-reader/probe")).probeComicBook(context); },
    async load() { return (await import("@anyfile/comic-book-reader")).comicBookViewer; },
  },
  {
    manifest: mobiManifest,
    async probe(context) { return (await import("@anyfile/mobi-reader/probe")).probeMobi(context); },
    async load() { return (await import("@anyfile/mobi-reader")).mobiViewer; },
  },
  {
    manifest: fictionBookManifest,
    async probe(context) { return (await import("@anyfile/fictionbook-reader/probe")).probeFictionBook(context); },
    async load() { return (await import("@anyfile/fictionbook-reader")).fictionBookViewer; },
  },
  {
    manifest: epubManifest,
    async probe(context) { return (await import("@anyfile/epub-reader/probe")).probeEpub(context); },
    async load() { return (await import("@anyfile/epub-reader")).epubViewer; },
  },
  {
    manifest: chmManifest,
    async probe(context) { return (await import("@anyfile/chm-reader/probe")).probeChm(context); },
    async load() { return (await import("@anyfile/chm-reader")).chmViewer; },
  },
  {
    manifest: djvuManifest,
    async probe(context) { return (await import("@anyfile/djvu-reader/probe")).probeDjvu(context); },
    async load() { return (await import("@anyfile/djvu-reader")).djvuViewer; },
  },
];
