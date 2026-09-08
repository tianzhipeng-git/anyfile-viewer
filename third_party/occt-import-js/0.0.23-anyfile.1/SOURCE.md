# OCCT import runtime 0.0.23-anyfile.1

occt-import-js (LGPL-2.1) commit c2148e54b456b571238d35cac037d304053d64b2:
https://github.com/kovacsv/occt-import-js/archive/c2148e54b456b571238d35cac037d304053d64b2.tar.gz
SHA-256: 2bd3799b2ac56cbf3f0df6300a51c8890e137bd001462702b356f621e33ff192

Open CASCADE (LGPL-2.1 with OCCT exception) commit d2abb6d844231cb8f29be6894440874a4700e4a5:
https://github.com/Open-Cascade-SAS/OCCT/archive/d2abb6d844231cb8f29be6894440874a4700e4a5.tar.gz
SHA-256: 2715d89a1bc44dfd34dab88f729c445ea93f6b57d6539b0c89614a80ae144a6c

The adjacent patch-source.py is the complete modification to these sources. Build instructions are provided in build.sh and README.md. This dynamically imported module is replaceable with a rebuilt compatible module, including for debugging modifications. No proprietary source is linked into the library. Browser application code invokes the library through its public interface.

The registry binary was rejected because it allows a 2 GiB heap and does not bound output arrays. This build starts with 32 MiB and caps WASM memory at 256 MiB, with bounded mesh output and dynamic execution disabled. Imported files remain local.
