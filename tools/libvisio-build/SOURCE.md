# Visio browser runtime 0.1.11-anyfile.1

This runtime uses unmodified libvisio 0.1.11 and librevenge 0.0.5 under
MPL-2.0. Their exact corresponding source archives are in `sources/`.
The Anyfile adapter and CMake build recipe are in the application repository,
`tools/libvisio-build/`. No changes are made to upstream source files.

Additional components: libxml2 2.15.4 (MIT), ICU 68.2 (Unicode/ICU),
Boost headers 1.83.0 (BSL-1.0), zlib 1.3.1 (zlib), Emscripten 4.0.10
(MIT/University of Illinois). Original notices are in `licenses/`.
`build-info.json` records source URLs, archive hashes, toolchain digest,
recipe hashes, flags and output hashes.

ICU converter data is a subset of the upstream ICU data archive, extracted
without changing its entries. It includes Windows codepages used by Visio,
including Chinese, Japanese and Korean, and their aliases. Unicode UTF-8
and UTF-16 converters are built into ICU. The original ICU notice applies.

The engine parses files only inside a terminable Worker. Generated SVG is
used only as an image, never as interactive HTML/SVG in the application DOM.
