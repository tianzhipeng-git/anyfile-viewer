# FFmpeg playback runtime 9.0.1-anyfile.1

This software uses FFmpeg 9.0.1 under LGPL-2.1-or-later. See
[LICENSE.FFmpeg](LICENSE.FFmpeg) and [LICENSE.Emscripten](LICENSE.Emscripten).
The independently authored project adapter is Apache-2.0; see
[LICENSE.Adapter](LICENSE.Adapter). No upstream FFmpeg source is modified.

The exact FFmpeg source distributed with this binary is
[ffmpeg-source.tar.xz](ffmpeg-source.tar.xz).
Upstream: https://ffmpeg.org/releases/ffmpeg-9.0.1.tar.xz
SHA-256: cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635

[relink-materials.tar.gz](relink-materials.tar.gz) includes the application
C adapter, Worker, build/link recipes, generated public configuration header,
and the FFmpeg static libraries used to link this WASM. The source archive,
full configuration and exact input/output hashes are identified in
[build-info.json](build-info.json). Emscripten 4.0.10 is pinned by Docker digest
in upstream.json inside the relinking archive.

To rebuild or replace FFmpeg: unpack the relinking archive into a workspace;
run tools/ffmpeg-playback-build/build.sh with an output directory. It downloads
and verifies the exact original source. To use a modified FFmpeg, change the
source URL/hash and artifact revision, then rebuild with the same public ABI.
For adapter-only changes, relink.sh reuses the hashed static libraries from a
previous build. The browser ABI accepts a replacement library implementing
the documented fp_* exports; there is no runtime signature or license lock.
The integrity checks in prepare/build are development safeguards and can be
updated when rebuilding your own version. Reverse engineering for debugging
modifications to LGPL-covered components is not prohibited.

This decode-only build disables programs, encoders, muxers, filters, devices,
network, all URL protocols, GPL/nonfree components and external library
autodetection. Custom AVIO reads only the one local File mounted read-only
through WORKERFS and denies secondary inputs. Browser playback and supported
format subsets are separate project code; compiled decoders are not product
support claims. This distribution grants copyright permissions under the
stated licenses; it does not grant third-party patent rights.
