import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findViewerRegistrations, resolveViewerRegistrations } from "@anyfile/viewer-protocol";
import { viewerRegistrations } from "../viewer-registrations";

afterEach(() => vi.unstubAllGlobals());

describe("media routing", () => {
  it("resolves native and non-native audio/video probes accurately", async () => {
    const videoBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/browser-video/examples/mp4-avc-aac-faststart.mp4",
    ));
    const video = await resolveViewerRegistrations(
      new File([videoBytes], "clip.mp4"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(video.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["browser-video", 3], ["hex-viewer", 1]]);

    vi.stubGlobal("VideoDecoder", class VideoDecoder {});
    vi.stubGlobal("AudioDecoder", class AudioDecoder {});
    vi.stubGlobal("AudioContext", class AudioContext {});

    const matroskaBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/non-native-video/examples/mkv-vp9-opus.mkv",
    ));
    const matroska = await resolveViewerRegistrations(
      new File([matroskaBytes], "clip.mkv"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(matroska.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["non-native-video", 3], ["hex-viewer", 1]]);

    const mp3Bytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/browser-audio/examples/mp3-cbr.mp3",
    ));
    const audio = await resolveViewerRegistrations(
      new File([mp3Bytes], "tone.mp3"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(audio.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["browser-audio", 3], ["hex-viewer", 1]]);

    const mkaBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/non-native-audio/examples/mka-opus.mka",
    ));
    const mka = await resolveViewerRegistrations(
      new File([mkaBytes], "tone.mka"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(mka.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["non-native-audio", 3], ["hex-viewer", 1]]);

    const waveAlawBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/non-native-audio/examples/wave-alaw.wav",
    ));
    const waveAlaw = await resolveViewerRegistrations(
      new File([waveAlawBytes], "tone.wav"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(waveAlaw.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["non-native-audio", 3], ["hex-viewer", 1]]);

    const wavePcmBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/browser-audio/examples/wave-s16le.wav",
    ));
    const wavePcm = await resolveViewerRegistrations(
      new File([wavePcmBytes], "tone.wav"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(wavePcm.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["browser-audio", 3], ["hex-viewer", 1]]);

    const transportStreamBytes = readFileSync(join(
      process.cwd(),
      "viewer/plugins/non-native-video/examples/ts-avc-aac.ts.fixture",
    ));
    const transportStream = await resolveViewerRegistrations(
      new File([transportStreamBytes], "clip.ts"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(transportStream.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["non-native-video", 3], ["hex-viewer", 1]]);
  });

  it("orders 360 camera, video and audio candidates consistently", () => {
    expect(findViewerRegistrations("capture.360", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["gopro-max", "hex-viewer"]);
    expect(findViewerRegistrations("capture.osv", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["dji-osmo", "hex-viewer"]);
    expect(findViewerRegistrations("photo.insp", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["insta360", "hex-viewer"]);
    expect(findViewerRegistrations("proxy.lrv", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["insta360", "hex-viewer"]);
    expect(findViewerRegistrations("clip.mp4", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-video", "browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("clip.webm", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-video", "browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("clip.mov", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-video", "non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.3gp", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.mkv", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.ts", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["non-native-video", "ace-code-text", "hex-viewer"]);
    expect(findViewerRegistrations("clip.m2ts", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.ogv", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["non-native-video", "hex-viewer"]);
    expect(findViewerRegistrations("clip.ogg", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["non-native-video", "browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("tone.mp3", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-audio", "hex-viewer"]);
    expect(findViewerRegistrations("tone.mka", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["non-native-audio", "hex-viewer"]);
    expect(findViewerRegistrations("clip.avi", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["ffmpeg-video", "hex-viewer"]);
    for (const extension of ["wmv", "asf", "mpg", "mpeg", "vob"]) {
      expect(findViewerRegistrations(`clip.${extension}`, viewerRegistrations).map(({ manifest }) => manifest.id))
        .toEqual(["ffmpeg-video", "hex-viewer"]);
    }
    expect(findViewerRegistrations("tone.aiff", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["ffmpeg-audio", "hex-viewer"]);
    expect(findViewerRegistrations("tone.wma", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["ffmpeg-audio", "hex-viewer"]);
    expect(findViewerRegistrations("tone.wav", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-audio", "non-native-audio", "hex-viewer"]);
  });
});
