export const MAX_TRACKS = 32;
export const MAX_CODED_DIMENSION = 8192;
export const MAX_CODED_PIXELS = 33_554_432;
export const BLOB_CACHE_BYTES = 8 * 1024 * 1024;
export const AUDIO_LOOKAHEAD_SECONDS = 1;

export const SUPPORTED_VIDEO_CODECS = new Set(["avc", "hevc", "vp8", "vp9", "av1"]);
export const SUPPORTED_AUDIO_CODECS = new Set(["aac", "opus", "vorbis", "mp3", "flac"]);
export const SUPPORTED_MOV_VIDEO_CODECS = new Set(["avc", "hevc"]);
export const SUPPORTED_MOV_AUDIO_CODECS = new Set(["pcm-s16", "pcm-s16be"]);
