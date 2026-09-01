# `@anyfile/insta360-viewer`

Local WebGL panorama viewing for the verified Insta360 X3 layouts delivered in stages 1 through 4:

- `.insp`: 5952×2976 JPEG, Arashi Vision / Insta360 X3 EXIF, side-by-side dual fisheye;
- `.lrv`: 1024×512 AVC/H.264 with AAC-LC 48 kHz stereo, side-by-side dual fisheye.
- paired `.insv`: matching `_00`/`_10` 2880×2880 AVC/H.264 files with AAC-LC 48 kHz stereo, one fisheye per file.
- `.dng`: 2976×5952 Arashi Vision / Insta360 X3 DNG, developed locally with the shared LibRaw decoder and split as top-bottom dual fisheye.

The manifest, bounded probe and complete WebGL/media/RAW implementation are separate exports. Gyro leveling, FlowState and additional camera models are intentionally not declared by this stage. Non-X3 DNG files remain routed to the general camera RAW viewer.
