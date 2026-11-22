import { browserAudioManifest } from "@anyfile/browser-audio-viewer/manifest";
import { browserVideoManifest } from "@anyfile/browser-video-viewer/manifest";
import { djiOsmoManifest } from "@anyfile/dji-osmo-viewer/manifest";
import { ffmpegAudioManifest } from "@anyfile/ffmpeg-audio-viewer/manifest";
import { ffmpegVideoManifest } from "@anyfile/ffmpeg-video-viewer/manifest";
import { goProMaxManifest } from "@anyfile/gopro-max-viewer/manifest";
import { insta360Manifest } from "@anyfile/insta360-viewer/manifest";
import { nonNativeAudioManifest } from "@anyfile/non-native-audio-viewer/manifest";
import { nonNativeVideoManifest } from "@anyfile/non-native-video-viewer/manifest";
import type { ViewerPluginRegistration } from "@anyfile/viewer-protocol";

export const mediaRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: djiOsmoManifest,
    async probe(context) { return (await import("@anyfile/dji-osmo-viewer/probe")).probeDjiOsmo(context); },
    async load() { return (await import("@anyfile/dji-osmo-viewer")).djiOsmoViewer; },
  },
  {
    manifest: goProMaxManifest,
    async probe(context) { return (await import("@anyfile/gopro-max-viewer/probe")).probeGoProMax(context); },
    async load() { return (await import("@anyfile/gopro-max-viewer")).goProMaxViewer; },
  },
  {
    manifest: insta360Manifest,
    async probe(context) { return (await import("@anyfile/insta360-viewer/probe")).probeInsta360(context); },
    async load() { return (await import("@anyfile/insta360-viewer")).insta360Viewer; },
  },
  {
    manifest: browserVideoManifest,
    async probe(context) { return (await import("@anyfile/browser-video-viewer/probe")).probeBrowserVideo(context); },
    async load() { return (await import("@anyfile/browser-video-viewer")).browserVideoViewer; },
  },
  {
    manifest: nonNativeVideoManifest,
    async probe(context) { return (await import("@anyfile/non-native-video-viewer/probe")).probeNonNativeVideo(context); },
    async load() { return (await import("@anyfile/non-native-video-viewer")).nonNativeVideoViewer; },
  },
  {
    manifest: browserAudioManifest,
    async probe(context) { return (await import("@anyfile/browser-audio-viewer/probe")).probeBrowserAudio(context); },
    async load() { return (await import("@anyfile/browser-audio-viewer")).browserAudioViewer; },
  },
  {
    manifest: nonNativeAudioManifest,
    async probe(context) { return (await import("@anyfile/non-native-audio-viewer/probe")).probeNonNativeAudio(context); },
    async load() { return (await import("@anyfile/non-native-audio-viewer")).nonNativeAudioViewer; },
  },
  {
    manifest: ffmpegVideoManifest,
    async probe(context) { return (await import("@anyfile/ffmpeg-video-viewer/probe")).probeFfmpegVideo(context); },
    async load() { return (await import("@anyfile/ffmpeg-video-viewer")).ffmpegVideoViewer; },
  },
  {
    manifest: ffmpegAudioManifest,
    async probe(context) { return (await import("@anyfile/ffmpeg-audio-viewer/probe")).probeFfmpegAudio(context); },
    async load() { return (await import("@anyfile/ffmpeg-audio-viewer")).ffmpegAudioViewer; },
  },
];
