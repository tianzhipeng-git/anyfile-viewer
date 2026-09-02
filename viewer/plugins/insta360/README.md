# `@anyfile/insta360-viewer`

Local WebGL panorama viewing for verified Insta360 X3, One RS, X4, X5 and X6 sample layouts:

- `.insp`: 5952×2976 JPEG, Arashi Vision / Insta360 X3 EXIF, side-by-side dual fisheye;
- `.lrv`: X3 1024×512 and X4 1664×832 AVC/H.264 proxy video, side-by-side dual fisheye.
- `.insv`: X3 2880×2880 and One RS 3072×3072 `_00`/`_10` AVC/H.264 pairs; One RS 768×384 proxy files; and X4/X5/X6 single files containing two 3840×3840 HEVC tracks plus AAC audio.
- `.dng`: X3 2976×5952 top-bottom and X6 15520×7760 side-by-side Arashi Vision RAW. X6 Adobe Deflate strips are decoded in a Worker to a half-width/height CFA preview because LibRaw cannot unpack this layout.

The manifest, bounded probe and complete WebGL/media/RAW implementation are separate exports. Single-file dual-track video uses local range reads and WebCodecs through Mediabunny; no source file is copied or uploaded. If the browser cannot decode a 3840×3840 HEVC track, the viewer opens the file's indexed 1280×640 I420 equirectangular frame as an explicitly labelled static 360° preview. X4/X5/X6 read each file's per-lens MEI calibration from its indexed protobuf trailer instead of reusing X3's angle or a model-wide approximation. Gyro leveling and FlowState are not yet applied. Unknown DNG layouts remain routed to the general camera RAW viewer.
