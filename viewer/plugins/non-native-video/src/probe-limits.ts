export const PROBE_HEAD_BYTES = 512 * 1024;
export const PROBE_TAIL_BYTES = 256 * 1024;
export const PROBE_TOTAL_BYTES = PROBE_HEAD_BYTES + PROBE_TAIL_BYTES;
export const MAX_EBML_DEPTH = 12;
export const MAX_EBML_ELEMENTS = 4096;
export const MAX_TRACKS = 32;
export const MAX_CODED_DIMENSION = 8192;
export const MAX_CODED_PIXELS = 33_554_432;

export const VIDEO_CODECS = new Map([
  ["V_MPEG4/ISO/AVC", "avc"],
  ["V_MPEGH/ISO/HEVC", "hevc"],
  ["V_VP8", "vp8"],
  ["V_VP9", "vp9"],
  ["V_AV1", "av1"],
] as const);

export const AUDIO_CODECS = new Map([
  ["A_AAC", "aac"],
  ["A_OPUS", "opus"],
  ["A_VORBIS", "vorbis"],
  ["A_MPEG/L3", "mp3"],
  ["A_FLAC", "flac"],
] as const);
