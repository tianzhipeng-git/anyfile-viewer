export const PROBE_HEAD_BYTES = 256 * 1024;
export const PROBE_TAIL_BYTES = 64 * 1024;
export const BLOB_CACHE_BYTES = 8 * 1024 * 1024;
export const MAX_TRACKS = 16;
export const MAX_CHANNELS = 2;
export const MAX_SAMPLE_RATE = 192_000;
export const MAX_DURATION_SECONDS = 24 * 60 * 60;
export const MAX_BUFFER_SECONDS = 2;
export const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
export const PCM_LOOKAHEAD_SECONDS = 1;
export const MATROSKA_CODECS = new Set(["aac", "opus", "vorbis", "flac"]);
/** Mediabunny software-decodes these; browser-audio does not claim them. */
export const WAVE_CODECS = new Set(["alaw", "ulaw"]);
export const SOFTWARE_PCM_CODECS = WAVE_CODECS;
