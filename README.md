# Anyfile Viewer

**Open more kinds of files, right in your browser.**

English · [简体中文](README.zh-CN.md)

[Open the viewer](https://www.anyfile.top/en/view) · [Explore formats](https://www.anyfile.top/en) · [Report an issue](https://github.com/tianzhipeng-git/anyfile-viewer/issues)

Anyfile Viewer is a free, open-source file viewer that reads and previews local files on your device. No desktop installation, no account, and no file uploads for previewing.

The goal is broad format coverage with useful, fast, read-only previews. It focuses on viewing rather than editing, with lightweight startup and bounded resource use for large files.

## What you can open

| Category | Examples |
| --- | --- |
| Documents & spreadsheets | PDF, DOCX, PPTX, XLSX, XLS, XLSB, ODS, Numbers |
| Images & design | JPEG, PNG, WebP, SVG, TIFF, HEIC/HEIF, JPEG XL, camera RAW, PSD, PXD, EPS/PostScript |
| Audio & video | MP3, WAV, FLAC, Ogg, MP4, WebM, MOV, MKV, and selected non-native codecs |
| 360° camera media | Supported Insta360, GoPro MAX, and DJI Osmo 360 photos and videos |
| Ebooks & comics | EPUB, unencrypted MOBI/AZW3, FictionBook, CBZ, CBR |
| Data & databases | CSV, JSON, Parquet, Arrow, DuckDB, SQLite, HAR |
| CAD, 3D & point clouds | DXF, DWG, STEP, IGES, OBJ, glTF/GLB, STL, 3MF, LAS/LAZ, PCD |
| Code & developer files | Source code, configuration files, NumPy arrays, source maps, WebAssembly structure |
| Archives & packages | File listings and metadata for ZIP, RAR, 7z, TAR, and supported package formats |
| Other binary files | Hexadecimal inspection as a fallback |

These are examples, not a complete compatibility list. Preview depth varies by format: some viewers render full pages or interactive models, while others show embedded previews, structure, or metadata. Media playback depends on the codec inside the container and the browser. Large files remain subject to device memory and browser limits.

See the [format catalog](https://www.anyfile.top/en) for individual capabilities and limitations.

## Use it

1. Open the [viewer workspace](https://www.anyfile.top/en/view).
2. Select files, drag them into the workspace, or open a folder where the browser supports it.
3. Choose a file in the sidebar to load its viewer.

The interface is available in English and Simplified Chinese. Folder access and some decoding features depend on browser capabilities.

### Local processing and privacy

Selected files are read, decoded, and rendered in your browser; their contents are not uploaded for conversion or previewing. Viewer code, WebAssembly decoders, and other runtime assets may be downloaded on demand, so local processing does not mean fully offline operation.

The hosted site uses Vercel Analytics and Speed Insights. Feedback is sent only when you submit the form and does not attach your files. See the [privacy policy](https://www.anyfile.top/en/privacy) for details.

## Run locally

Requires **Node.js 24.x** and **pnpm 10.32.1**.

```bash
git clone https://github.com/tianzhipeng-git/anyfile-viewer.git
cd anyfile-viewer
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The root redirects to `/en`; the Chinese workspace is at `/zh-CN/view`.

`pnpm dev` and `pnpm build` prepare the required browser assets automatically. Ordinary application builds use the checked-in or package-provided runtime artifacts and do not compile native dependencies from source.

Optional environment variables in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Site URL used for metadata; defaults to localhost in development and `https://www.anyfile.top` in production. |
| `NEXT_PUBLIC_FEEDBACK_ENDPOINT` | Enables feedback submission to the separate Cloudflare Worker + D1 service. Omit it to leave submission disabled. |

Feedback setup and deployment are covered in the [feedback service README](services/feedback/README.md).

### Validate and build

```bash
pnpm test
pnpm lint
pnpm build
pnpm start
```

`pnpm test` runs application and workspace package tests. The production build also checks viewer bundle boundaries, initial JavaScript size, and runtime asset policies.

To test one plugin:

```bash
pnpm --filter @anyfile/pdf-viewer test
```

Deploy as a Next.js application and preserve the response headers in `next.config.ts`, including the viewer's cross-origin isolation headers. See the [loading and deployment guide](docs/viewer-loading-and-deployment.md).

## Project structure

Built with Next.js, React, TypeScript, and a pnpm workspace. Format implementations load on demand through a shared viewer protocol.

| Path | Responsibility |
| --- | --- |
| `src/app/[locale]/` | Localized pages: home, categories, formats, plugin details, and viewer workspace |
| `src/components/` | Website shell and file workspace |
| `src/content/` | Format catalog and bilingual page content |
| `src/lib/viewer-registrations.ts` | Plugin registration and dynamic loading |
| `viewer/plugins/` | Individual format viewers |
| `viewer/protocol/` | Host/plugin interfaces and validation |
| `viewer/ui/`, `viewer/rendering*/` | Shared UI and rendering infrastructure |
| `viewer/runtime-assets/`, `viewer/plugin-policies.json` | Runtime asset loading and policies |
| `tools/`, `third_party/` | Source-build recipes and audited third-party artifacts |
| `services/feedback/` | Optional feedback backend |

## Contributing

Bug reports, new format viewers, and improvements to existing previews are welcome. For a reproducible issue, include the file extension, browser version, expected result, and actual behavior. Use a non-sensitive sample if one is needed.

Before changing a viewer, read the relevant project guides (currently in Chinese):

- [Plugin protocol](docs/viewer-plugin-protocol.md) — manifests, selection, workspace access, and lifecycle.
- [Rendering guidelines](docs/viewer-rendering-guidelines.md) — layout, asynchronous rendering, accessibility, and content safety.
- [Loading and deployment](docs/viewer-loading-and-deployment.md) — dynamic imports, Workers/WASM, runtime assets, and response headers.
- [Shared UI and rendering architecture](docs/viewer-ui-and-rendering-architecture.md) — shared packages and renderer boundaries.
- [Source-built dependencies](docs/viewer-source-built-dependencies.md) — build recipes, patches, and vendored artifacts.

Keep previews local and read-only, load heavy dependencies on demand, and document the supported subset of a format honestly.

## License

Project-owned code is licensed under [Apache-2.0](LICENSE). Third-party libraries and runtime assets retain their own licenses; see [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
