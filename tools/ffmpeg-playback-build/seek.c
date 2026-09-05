#include "bridge.h"
#include <string.h>

/* MPEG-PS read_timestamp marks PES entries AVINDEX_KEYFRAME without checking
 * pictures (mpeg.c explicitly marks that FIXME). Its timestamp seek does not
 * guarantee a decodable preceding I picture. Verify the first decoded picture
 * in a bounded backwards window, then rewind to that verified recovery point.
 * The trial emits nothing to JS; rewinding preserves all audio for playback. */
int fp_seek_demux(int64_t target) {
    if (s.tracks[0].index < 0 || strcmp(s.format->iformat->name, "mpeg"))
        return avformat_seek_file(s.format, -1, INT64_MIN, target, target, 0);
    int64_t start = (int64_t)(s.origin * AV_TIME_BASE);
    for (int seconds = 1; seconds <= 16; seconds *= 2) {
        int64_t earlier = FFMAX(start, target - (int64_t)seconds * AV_TIME_BASE);
        int ret = avformat_seek_file(s.format, -1, INT64_MIN, earlier, earlier, 0);
        if (ret < 0) return ret;
        fp_reset_decoders();
        for (int events = 0; events < 2048; events++) {
            ret = fp_decode_next();
            if (ret < 0) return ret == FP_LIMIT ? AVERROR(ENOMEM) : AVERROR_INVALIDDATA;
            if (ret == 0) break;
            if (ret != 1) continue;
            // At the actual start, a video's first PTS can follow the audio's.
            if (earlier == start || (s.timestamp + s.origin) * AV_TIME_BASE <= target)
                return avformat_seek_file(s.format, -1, INT64_MIN, earlier, earlier, 0);
            break;
        }
        if (earlier == start) return AVERROR_INVALIDDATA;
    }
    s.limit = 1;
    return AVERROR(ENOMEM);
}
