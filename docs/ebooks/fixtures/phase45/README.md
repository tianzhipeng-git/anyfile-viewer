# Phase 4–5 fixtures

Project-owned synthetic text and images, Apache-2.0. No commercial publication or DRM key is included.

- `scripts/generate-ebook-phase45-fixtures.py`: derives MOBI7/KF8/joint files from the existing synthetic EPUB using Calibre 6.29.0; writes PalmDOC, RAR4/RAR5 Stored and USTAR directly. Generates uncompressed and Huffman variants from the same MOBI text, a cyclic dictionary, altered offsets/count/length/encryption fields, and raw active-content probes.
- `scripts/generate-ebook-solid-fixtures.py`: derives solid RAR5 and Copy/LZMA2 7z from the owned 300-page CBZ. The exact macOS ARM RAR 7.23 trial CLI URL/hash is recorded in the script and manifest; it is downloaded only to a temporary directory for fixture generation and is not an application dependency or redistributed tool. `bsdtar` creates the 7z samples.
- `manifest.json`: file SHA-256, sizes and actual generator versions. Calibre may generate changing metadata IDs/times; re-generation updates hashes and requires reviewing the results. Ordinary tests consume the checked-in fixtures and never require the generator tools or network.

The tiny 300-page solid fixtures exercise page count/order/caching; they are not representative of a 128 MiB real comic. RAR4 Stored is the direct browser comic proof; other RAR4 compression modes are implemented by the selected decoder but retain a pending combination-specific verification status.
