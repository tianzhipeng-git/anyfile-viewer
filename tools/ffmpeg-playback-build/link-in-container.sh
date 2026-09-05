#!/usr/bin/env bash
set -euo pipefail
recipe=/work/tools/ffmpeg-playback-build
source=$1
libraries=$2
output=$3
emcc "$recipe/bridge.c" "$recipe/output.c" "$recipe/seek.c" -I"$source" \
  "$libraries/libavformat.a" "$libraries/libavcodec.a" "$libraries/libswscale.a" \
  "$libraries/libswresample.a" "$libraries/libavutil.a" \
  -O3 --no-entry -lworkerfs.js \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPlaybackRuntime \
  -sENVIRONMENT=worker -sDYNAMIC_EXECUTION=0 -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=268435456 -sSTACK_SIZE=1048576 \
  -sFILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,WORKERFS,ccall,UTF8ToString,HEAPU8 \
  -sEXPORTED_FUNCTIONS=_fp_open,_fp_next,_fp_seek,_fp_close,_fp_value,_fp_data,_fp_info,_fp_io_test \
  -o "$output/ffmpeg-playback.js"
