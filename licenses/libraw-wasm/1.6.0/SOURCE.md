# libraw-wasm 1.6.0 corresponding source

Anyfile distributes the upstream `libraw-wasm@1.6.0` browser files unchanged.
The package was built upstream from the inputs below. The source archives are
available over HTTPS and are identified by immutable commits and SHA-256 hashes.

| Component | Version / commit | Source archive | SHA-256 |
|---|---|---|---|
| libraw-wasm | `v1.6.0` / `32fd36a9883a10c1632bc20073f1ea88cc60487a` | <https://github.com/ybouane/LibRaw-Wasm/archive/32fd36a9883a10c1632bc20073f1ea88cc60487a.tar.gz> | `70eaf2f4d72850e3ae787f1ff34a7feb60dd03a59d9d9172c23f860532e76504` |
| LibRaw | `0.22.1` / `b860248a89d9082b8e0a1e202e516f46af9adb29` | <https://github.com/LibRaw/LibRaw/archive/b860248a89d9082b8e0a1e202e516f46af9adb29.tar.gz> | `f5da1e522ea195b54b30f3ff105ef2193daa04ea165dea825b4d6fe9d886395b` |
| Little CMS | `lcms2.19.1` / `21c582a594fe5279f90c0b93437c398f93bf62b0` | <https://github.com/mm2/Little-CMS/archive/21c582a594fe5279f90c0b93437c398f93bf62b0.tar.gz> | `0d953b598c25cc202a8f77e584fd4c7d285f759100fd391f77eca32574717509` |
| Emscripten | `5.0.7` / `263db4cffa6f9fc2ec514a70abac81362ea41849` | <https://github.com/emscripten-core/emscripten/tree/263db4cffa6f9fc2ec514a70abac81362ea41849> | See the signed Git tag and source tree |

The upstream `compileLibraw.sh` enables Emscripten ports for IJG libjpeg 9f,
libpng 1.6.55, and zlib 1.3.1. Emscripten 5.0.7 records their source URLs and
SHA-512 values in `tools/ports/libjpeg.py`, `libpng.py`, and `zlib.py`:

- IJG libjpeg 9f: `7f733d79cf176c690dcf127352f9aa7ec48000455944f286faae606cdeada6f6865b4a3f9f01bda8947b5b1089bb3e52d2b56879b6e871279ec5cbd1829304dc`;
- libpng 1.6.55: `45d3c4c3bd3d22dd93026e1bdff8df8133459a2903fb70be178899a55d256bab55bb5c4220d790202fce578e346c040c5c00e1f004cf5c4dcbf387a30d43e701`;
- zlib 1.3.1: `8c9642495bafd6fad4ab9fb67f09b268c69ff9af0f4f20cf15dfc18852ff1f312bd8ca41de761b3f8d8e90e77d79f2ccacd3d4c5b19e475ecf09d021fdfe9088`.

Rebuild with Emscripten 5.0.7 by following `compileLibraw.sh` in the exact
libraw-wasm source above. Anyfile has not modified the upstream wrapper or
compiled libraries. The runtime files are copied byte-for-byte from the npm
package locked by `pnpm-lock.yaml`.
