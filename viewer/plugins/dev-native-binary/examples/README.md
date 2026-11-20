# Native Binary Examples

All sample files in this directory are synthetic or compiled locally from minimal C source with zero external dependencies or proprietary content.

- `sample.elf`: Synthetic ELF64 x86-64 executable with `PT_LOAD`, `PT_INTERP`, `PT_NOTE` GNU Build-ID, `.dynsym`, and `.dynamic` (`DT_NEEDED`).
- `sample.so`: Synthetic ELF64 x86-64 shared object with `DT_SONAME` and `DT_NEEDED`.
- `sample.o`: ELF64 x86-64 relocatable object compiled via `clang -target x86_64-linux-gnu -c`.
- `sample-universal.dylib`: Universal (Fat) Mach-O (`arm64` + `x86_64`) compiled via `clang -shared` and combined with `lipo`.
- `sample.bundle`: Mach-O `arm64` loadable bundle compiled via `clang -bundle`.
- `sample.a`: Unix static library archive created with `ar rcs` containing a Mach-O `arm64` object member and `__.SYMDEF`.
- `sample.exe`: Synthetic PE32+ (AMD64) console executable with `.text`, `.rdata`, `KERNEL32.dll` import, and CodeView PDB debug directory.
- `sample.dll`: Synthetic PE32+ (AMD64) DLL with export table (`sample_export`), import table, and CodeView PDB debug directory.
- `sample.obj`: COFF x86-64 relocatable object compiled via `clang -target x86_64-pc-windows-msvc -c`.
- `disguised-text.elf`, `truncated-header.dll`, `corrupt-macho.dylib`: Negative test fixtures for rejection and error handling.
