#include "bridge.h"
#include <math.h>
#include <libavutil/imgutils.h>
#include <libavutil/mem.h>

void fp_output_reset(void) {
    s.kind = s.bytes = s.width = s.height = s.samples = s.channels = s.rate = 0;
    s.timestamp = s.frame_duration = 0;
}
static int reserve(int bytes) {
    if (bytes <= 0 || bytes > FP_BYTES) return FP_LIMIT;
    av_fast_malloc(&s.output, &s.output_capacity, bytes);
    if (!s.output) return FP_LIMIT;
    s.bytes = bytes; return 0;
}
int fp_convert(int slot) {
    AVFrame *f = s.frame; Track *t = &s.tracks[slot];
    AVStream *stream = s.format->streams[t->index];
    int64_t pts = f->best_effort_timestamp;
    s.timestamp = pts == AV_NOPTS_VALUE ? t->next_timestamp : pts * av_q2d(stream->time_base) - s.origin;
    // A byte-based seek can begin inside a PES/frame. Wait for a real timestamp
    // anchor during bounded seek recovery instead of assigning the requested time.
    if (!isfinite(s.timestamp)) return t->recovering ? 3 : FP_INVALID;
    if (f->decode_error_flags || (f->flags & AV_FRAME_FLAG_CORRUPT)) return t->recovering ? 3 : FP_INVALID;
    if (slot == 0) {
        if (f->width <= 0 || f->height <= 0 || (int64_t)f->width * f->height > FP_PIXELS) return FP_LIMIT;
        int size = av_image_get_buffer_size(AV_PIX_FMT_YUV420P, f->width, f->height, 1);
        int ret = reserve(size); if (ret < 0) return ret;
        s.sws = sws_getCachedContext(s.sws, f->width, f->height, f->format,
            f->width, f->height, AV_PIX_FMT_YUV420P, SWS_BILINEAR, NULL, NULL, NULL);
        if (!s.sws) return FP_LIMIT;
        uint8_t *planes[4]; int strides[4];
        av_image_fill_arrays(planes, strides, s.output, AV_PIX_FMT_YUV420P, f->width, f->height, 1);
        if (sws_scale(s.sws, (const uint8_t *const *)f->data, f->linesize, 0, f->height, planes, strides) != f->height) return FP_INVALID;
        s.width = f->width; s.height = f->height;
        AVRational fps = av_guess_frame_rate(s.format, stream, f);
        s.frame_duration = f->duration > 0 ? f->duration * av_q2d(stream->time_base) : fps.num > 0 && fps.den > 0 ? av_q2d(av_inv_q(fps)) : 0;
        s.kind = 1;
    } else {
        s.rate = f->sample_rate; s.channels = f->ch_layout.nb_channels;
        if (s.rate < 8000 || s.rate > 96000 || s.channels < 1 || s.channels > 2 || f->nb_samples < 1 || f->nb_samples > 65536) return FP_LIMIT;
        // No rate conversion/downmix in the spike: preserve rate/layout, normalize only sample storage.
        if (s.rate != t->codec->sample_rate || av_channel_layout_compare(&f->ch_layout, &t->codec->ch_layout)) return FP_UNSUPPORTED;
        if (!s.swr) {
            int ret = swr_alloc_set_opts2(&s.swr, &f->ch_layout, AV_SAMPLE_FMT_FLT, s.rate,
                &f->ch_layout, f->format, s.rate, 0, NULL);
            if (ret < 0 || swr_init(s.swr) < 0) return FP_INVALID;
        }
        if (f->format != t->codec->sample_fmt) return FP_UNSUPPORTED;
        int ret = reserve(f->nb_samples * s.channels * sizeof(float)); if (ret < 0) return ret;
        s.samples = swr_convert(s.swr, &s.output, f->nb_samples, (const uint8_t **)f->extended_data, f->nb_samples);
        if (s.samples != f->nb_samples || swr_get_delay(s.swr, s.rate) != 0) return FP_INVALID;
        const float *pcm = (const float *)s.output;
        for (int i = 0; i < s.samples * s.channels; i++) if (!isfinite(pcm[i])) return FP_INVALID;
        s.frame_duration = (double)s.samples / s.rate;
        s.kind = 2;
    }
    if (!isfinite(s.frame_duration) || s.frame_duration <= 0) return FP_INVALID;
    t->next_timestamp = s.timestamp + s.frame_duration;
    return s.kind;
}
