# ReadStat browser runtime 1.1.9-anyfile.1

This runtime compiles unmodified ReadStat 1.1.9 (MIT) read-side sources with
zlib 1.3.1 (zlib license) for compressed SPSS `.zsav` files, using Emscripten
4.0.10 (MIT/University of Illinois). Original notices are in `licenses/`.

The Anyfile adapter (`adapter.c`) and CMake recipe are in the application
repository under `tools/readstat-build/`. No upstream source file is changed.
`build-info.json` records source URLs, archive hashes, toolchain digest,
recipe hashes, flags and output hashes.

The engine reads file bytes on demand through a JavaScript callback inside a
terminable Worker; it has no filesystem or network access. Its JSON output is
bounded (48 MiB per call, 4 KiB per text cell, 200,000 value labels).
