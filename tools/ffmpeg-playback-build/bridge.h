#ifndef ANYFILE_FFMPEG_PLAYBACK_H
#define ANYFILE_FFMPEG_PLAYBACK_H
#include <stdio.h>
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>
#include <libswresample/swresample.h>
#define FP_INVALID -1
#define FP_UNSUPPORTED -2
#define FP_LIMIT -3
#define FP_IO -4
#define FP_PIXELS (1920 * 1080)
#define FP_BYTES (16 * 1024 * 1024)

typedef struct {
    AVCodecContext *codec;
    int index, drained, recovering, recovery_packets;
    double next_timestamp;
} Track;
typedef struct {
    AVFormatContext *format;
    AVIOContext *io;
    FILE *file;
    AVPacket *packet;
    AVFrame *frame;
    Track tracks[2]; /* video, audio */
    struct SwsContext *sws;
    SwrContext *swr;
    uint8_t *output;
    unsigned output_capacity;
    int active, eof, flush_track, limit, error, work_left;
    int kind, bytes, width, height, samples, channels, rate;
    int64_t size, read_bytes, total_read;
    double timestamp, frame_duration, origin, duration, deadline;
    char info[1024];
} Session;
extern Session s;
int fp_convert(int track);
int fp_seek_demux(int64_t target);
int fp_decode_next(void);
void fp_reset_decoders(void);
void fp_output_reset(void);
#endif
