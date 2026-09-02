# `@anyfile/dji-osmo-viewer`

Local interactive panorama viewing for the supplied DJI Osmo 360 samples:

- `.jpg` / `.jpeg`: `Osmo / OQ001`, 15520×7760 GPano equirectangular panorama;
- `.osv`: MP4 with two 3840×3840 HEVC Main 10 fisheye tracks and AAC stereo audio.

The manifest, bounded probe and complete implementation are separate exports. OSV playback uses Mediabunny range reads, WebCodecs, Web Audio and a calibrated WebGL dual-fisheye projection. The source file is never uploaded or copied into memory as a whole. DJI `OP-041` DNG samples are ordinary Osmo Pocket RAW photographs and remain handled by the camera RAW viewer.

The video projection uses lens-specific focal, optical-center and in-plane rotation values measured jointly from the three supplied OSV recordings. Gyro stabilization, DJI private metadata and HDR-accurate output are not currently applied.
