# `@anyfile/insta360-viewer`

Local WebGL panorama viewing for the verified Insta360 X3 layouts delivered in stages 1 and 2:

- `.insp`: 5952×2976 JPEG, Arashi Vision / Insta360 X3 EXIF, side-by-side dual fisheye;
- `.lrv`: 1024×512 AVC/H.264 with AAC-LC 48 kHz stereo, side-by-side dual fisheye.

The manifest, bounded probe and complete WebGL/media implementation are separate exports. Paired `.insv`, Insta360 `.dng`, gyro leveling, FlowState and additional camera models are intentionally not declared by this stage.
