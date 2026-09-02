# `@anyfile/gopro-max-viewer`

Local interactive panorama viewing for the supplied GoPro samples:

- `.jpg` / `.jpeg`: GoPro / GoPro Max EXIF, 5760×2880 equirectangular panorama;
- `.360`: GoPro MAX 4096×1344 or MAX2 5952×1920 dual HEVC EAC tracks with AAC stereo playback.

The manifest, bounded probe and complete implementation are separate exports. Video playback uses Mediabunny range reads, WebCodecs and Web Audio; the source file is never copied into memory or uploaded. The additional Ambisonic PCM track, GPMF telemetry, gyro leveling and stabilization metadata are not currently applied.
