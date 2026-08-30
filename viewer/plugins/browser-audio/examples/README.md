# Browser audio fixed corpus

Run `./generate.sh` with FFmpeg 8.x to regenerate the synthetic three-second,
997 Hz fixtures and their SHA-256 manifest. The files contain no third-party
recording. `spike-aiff.aiff` and `spike-wma.wma` are stage-0 fallback evidence;
they are intentionally not declared by the browser-audio manifest. This FFmpeg
build has no Monkey's Audio encoder, so APE remains blocked pending an auditable
redistributable fixture.
