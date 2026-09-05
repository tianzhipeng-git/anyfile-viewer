#include "bridge.h"
#include <errno.h>
#include <math.h>
#include <emscripten/emscripten.h>
#include <libavutil/mem.h>
#include <libavutil/error.h>

Session s;
static int result(int err) {
    if (s.limit || err == AVERROR(ENOMEM)) return FP_LIMIT;
    if (err == AVERROR_DECODER_NOT_FOUND) return FP_UNSUPPORTED;
    return FP_INVALID;
}
static void budget(void) {
    s.read_bytes = 0; s.limit = 0; s.work_left = 8192;
    s.deadline = emscripten_get_now() + 10000;
}
static int interrupted(void *opaque) {
    (void)opaque;
    if (emscripten_get_now() > s.deadline) s.limit = 1;
    return s.limit;
}
static int read_packet(void *opaque, uint8_t *buf, int size) {
    (void)opaque;
    if (size < 0 || size > FP_BYTES || interrupted(NULL) || s.read_bytes + size > 32 * 1024 * 1024) {
        s.limit = 1; return AVERROR(ENOMEM);
    }
    size_t count = fread(buf, 1, size, s.file);
    s.read_bytes += count; s.total_read += count;
    if (!count) return ferror(s.file) ? AVERROR(EIO) : AVERROR_EOF;
    return (int)count;
}
static int64_t seek_file(void *opaque, int64_t offset, int whence) {
    (void)opaque;
    if (whence == AVSEEK_SIZE) return s.size;
    whence &= ~AVSEEK_FORCE;
    int64_t base = whence == SEEK_SET ? 0 : whence == SEEK_CUR ? ftello(s.file) : whence == SEEK_END ? s.size : -1;
    if (base < 0 || offset < -base || offset > s.size - base) return AVERROR(EINVAL);
    if (fseeko(s.file, base + offset, SEEK_SET)) return AVERROR(EIO);
    return ftello(s.file);
}
static int deny_open(AVFormatContext *ctx, AVIOContext **pb, const char *url, int flags, AVDictionary **options) {
    (void)ctx; (void)pb; (void)url; (void)flags; (void)options;
    return AVERROR(EACCES);
}
void fp_close(void) {
    for (int i = 0; i < 2; i++) avcodec_free_context(&s.tracks[i].codec);
    av_packet_free(&s.packet); av_frame_free(&s.frame);
    avformat_close_input(&s.format);
    if (s.io) { av_freep(&s.io->buffer); avio_context_free(&s.io); }
    if (s.file) fclose(s.file);
    sws_freeContext(s.sws); swr_free(&s.swr); av_freep(&s.output);
    memset(&s, 0, sizeof(s)); s.active = -1;
    s.tracks[0].index = s.tracks[1].index = -1;
}
static int open_track(int slot, int index) {
    AVCodecParameters *p = s.format->streams[index]->codecpar;
    if (slot == 0 && (p->width <= 0 || p->height <= 0 || (int64_t)p->width * p->height > FP_PIXELS)) return FP_LIMIT;
    if (slot == 1 && (p->sample_rate < 8000 || p->sample_rate > 96000 || p->ch_layout.nb_channels < 1 || p->ch_layout.nb_channels > 2)) return FP_LIMIT;
    const AVCodec *codec = avcodec_find_decoder(p->codec_id);
    if (!codec) return FP_UNSUPPORTED;
    Track *t = &s.tracks[slot];
    t->index = index; t->next_timestamp = NAN; t->codec = avcodec_alloc_context3(codec);
    if (!t->codec) return FP_LIMIT;
    int ret = avcodec_parameters_to_context(t->codec, p);
    if (ret < 0) return result(ret);
    t->codec->thread_count = 1; t->codec->max_pixels = FP_PIXELS;
    t->codec->pkt_timebase = s.format->streams[index]->time_base;
    t->codec->err_recognition = AV_EF_CRCCHECK | AV_EF_EXPLODE;
    ret = avcodec_open2(t->codec, codec, NULL);
    return ret < 0 ? result(ret) : 0;
}
int fp_open(const char *path, int video) {
    fp_close(); budget();
    av_log_set_level(AV_LOG_ERROR); av_max_alloc(64 * 1024 * 1024);
    s.file = fopen(path, "rb");
    if (!s.file) return FP_IO;
    if (fseeko(s.file, 0, SEEK_END) || (s.size = ftello(s.file)) <= 0 || fseeko(s.file, 0, SEEK_SET)) return FP_INVALID;
    uint8_t *buffer = av_malloc(64 * 1024);
    if (!buffer) return FP_LIMIT;
    s.io = avio_alloc_context(buffer, 64 * 1024, 0, NULL, read_packet, NULL, seek_file);
    if (!s.io) { av_free(buffer); return FP_LIMIT; }
    s.format = avformat_alloc_context();
    if (!s.format) return FP_LIMIT;
    s.format->pb = s.io; s.format->flags |= AVFMT_FLAG_CUSTOM_IO;
    s.format->io_open = deny_open;
    s.format->interrupt_callback = (AVIOInterruptCB){ interrupted, NULL };
    s.format->probesize = 512 * 1024; s.format->max_analyze_duration = 2 * AV_TIME_BASE;
    s.format->max_streams = 8; s.format->max_probe_packets = 512;
    s.format->max_index_size = 4 * 1024 * 1024;
    int ret = avformat_open_input(&s.format, NULL, NULL, NULL);
    if (ret < 0) return result(ret);
    ret = avformat_find_stream_info(s.format, NULL);
    if (s.limit) return FP_LIMIT;
    if (ret < 0) return result(ret);
    if (s.format->nb_programs > 1) return FP_UNSUPPORTED;
    int indices[2] = { -1, -1 };
    for (unsigned i = 0; i < s.format->nb_streams; i++) {
        AVStream *stream = s.format->streams[i];
        enum AVMediaType type = stream->codecpar->codec_type;
        if (stream->disposition & AV_DISPOSITION_ATTACHED_PIC) continue;
        int slot = type == AVMEDIA_TYPE_VIDEO ? 0 : type == AVMEDIA_TYPE_AUDIO ? 1 : -1;
        if (slot < 0) continue;
        if (indices[slot] >= 0) return FP_UNSUPPORTED;
        indices[slot] = i;
    }
    if ((video && indices[0] < 0) || (!video && (indices[0] >= 0 || indices[1] < 0))) return FP_UNSUPPORTED;
    if (s.format->duration == AV_NOPTS_VALUE || s.format->duration <= 0) return FP_UNSUPPORTED;
    s.duration = (double)s.format->duration / AV_TIME_BASE;
    s.origin = s.format->start_time == AV_NOPTS_VALUE ? 0 : (double)s.format->start_time / AV_TIME_BASE;
    for (int i = 0; i < 2; i++) if (indices[i] >= 0) {
        ret = open_track(i, indices[i]); if (ret < 0) return ret;
    }
    s.packet = av_packet_alloc(); s.frame = av_frame_alloc();
    if (!s.packet || !s.frame) return FP_LIMIT;
    AVCodecContext *v = s.tracks[0].codec, *a = s.tracks[1].codec;
    snprintf(s.info, sizeof(s.info),
      "{\"duration\":%.9f,\"origin\":%.9f,\"video\":%s,\"audio\":%s,\"width\":%d,\"height\":%d,\"sampleRate\":%d,\"channels\":%d,\"videoCodec\":\"%s\",\"audioCodec\":\"%s\"}",
      s.duration, s.origin, v ? "true" : "false", a ? "true" : "false", v ? v->width : 0, v ? v->height : 0,
      a ? a->sample_rate : 0, a ? a->ch_layout.nb_channels : 0, v ? avcodec_get_name(v->codec_id) : "", a ? avcodec_get_name(a->codec_id) : "");
    return 0;
}
int fp_decode_next(void) {
    if (!s.format || !s.packet || s.error) return s.error ? s.error : FP_INVALID;
    fp_output_reset();
    while (s.work_left-- > 0 && !interrupted(NULL)) {
        if (s.active >= 0) {
            Track *t = &s.tracks[s.active];
            int ret = avcodec_receive_frame(t->codec, s.frame);
            if (ret == 0) {
                ret = fp_convert(s.active); av_frame_unref(s.frame);
                if (ret == 3) continue; /* Untimed/corrupt seek preroll, never emitted. */
                if (ret < 0) s.error = ret;
                else t->recovering = 0;
                return ret;
            }
            if (ret == AVERROR_EOF) t->drained = 1;
            else if (ret != AVERROR(EAGAIN) && !(t->recovering && ret == AVERROR_INVALIDDATA)) return s.error = result(ret);
            s.active = -1;
        }
        if (s.eof) {
            while (s.flush_track < 2 && (!s.tracks[s.flush_track].codec || s.tracks[s.flush_track].drained)) s.flush_track++;
            if (s.flush_track == 2) return 0;
            int track = s.flush_track++;
            int ret = avcodec_send_packet(s.tracks[track].codec, NULL);
            if (ret < 0 && ret != AVERROR_EOF) return s.error = result(ret);
            s.active = track; continue;
        }
        int ret = av_read_frame(s.format, s.packet);
        if (s.limit) return s.error = FP_LIMIT;
        if (ret == AVERROR_EOF) { s.eof = 1; continue; }
        if (ret < 0) return s.error = result(ret);
        if (s.packet->size > FP_BYTES) { av_packet_unref(s.packet); return s.error = FP_LIMIT; }
        int track = s.packet->stream_index == s.tracks[0].index ? 0 : s.packet->stream_index == s.tracks[1].index ? 1 : -1;
        if (track >= 0) {
            Track *t = &s.tracks[track];
            if (t->recovering && ++t->recovery_packets > 512) { av_packet_unref(s.packet); return s.error = FP_LIMIT; }
            ret = avcodec_send_packet(t->codec, s.packet);
            av_packet_unref(s.packet);
            // MPEG-PS seek may land on a PES carrying a partial audio frame.
            // As in FFmpeg's decoder loop, recover from INVALIDDATA at this
            // discontinuity; ordinary playback errors remain fatal.
            if (t->recovering && ret == AVERROR_INVALIDDATA) continue;
            if (ret < 0) return s.error = result(ret);
            s.active = track;
        } else av_packet_unref(s.packet);
    }
    return s.error = FP_LIMIT;
}
int fp_next(void) { budget(); return fp_decode_next(); }
void fp_reset_decoders(void) {
    for (int i = 0; i < 2; i++) if (s.tracks[i].codec) {
        avcodec_flush_buffers(s.tracks[i].codec); s.tracks[i].drained = 0; s.tracks[i].next_timestamp = NAN;
        s.tracks[i].recovering = 1; s.tracks[i].recovery_packets = 0;
    }
    swr_free(&s.swr); av_packet_unref(s.packet); av_frame_unref(s.frame);
    s.active = -1; s.eof = s.flush_track = s.error = 0; fp_output_reset();
}
int fp_seek(double seconds) {
    if (!s.format || !isfinite(seconds) || seconds < 0 || seconds > s.duration) return FP_INVALID;
    budget();
    double micros = (seconds + s.origin) * AV_TIME_BASE;
    if (!isfinite(micros) || micros <= -9223372036854775808.0 || micros >= 9223372036854775808.0) return FP_LIMIT;
    int64_t target = (int64_t)micros;
    int ret = fp_seek_demux(target);
    if (s.limit) return s.error = FP_LIMIT;
    if (ret < 0) return s.error = result(ret);
    fp_reset_decoders();
    return 0;
}
const char *fp_info(void) { return s.info; }
uint8_t *fp_data(void) { return s.output; }
double fp_value(int key) {
    switch (key) {
      case 0: return s.bytes; case 1: return s.timestamp; case 2: return s.frame_duration;
      case 3: return s.width; case 4: return s.height; case 5: return s.rate;
      case 6: return s.channels; case 7: return s.samples; case 8: return (double)s.total_read;
      default: return 0;
    }
}
/* Exercises the same libc/WORKERFS 64-bit seek path, including a reverse seek. */
int fp_io_test(const char *path, double offset) {
    if (!isfinite(offset) || offset < 0 || offset > 9007199254740991.0) return FP_INVALID;
    FILE *file = fopen(path, "rb"); if (!file) return FP_IO;
    int ret = fseeko(file, (int64_t)offset, SEEK_SET);
    int value = ret ? FP_IO : fgetc(file);
    if (!ret && ftello(file) != (int64_t)offset + 1) value = FP_IO;
    if (fseeko(file, 0, SEEK_SET) || fgetc(file) != 42) value = FP_IO;
    fclose(file); return value;
}
