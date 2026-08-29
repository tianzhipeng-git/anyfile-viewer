# Browser video viewer

浏览器原生视频插件覆盖阶段 1 已验证的本地 ISO BMFF 与 WebM 组合。它使用有界 probe 识别真实容器、视频/音频轨道和 codec，再以 `<video controls>` 与 Object URL 播放完整文件。

当前声明：

- MP4/M4V：AVC + AAC-LC、AVC video-only、HEVC + AAC-LC 或 AV1 + AAC-LC；
- QuickTime/MOV：AVC + AAC-LC；
- 3GPP/3G2：AVC + AAC-LC；
- WebM：VP8 + Vorbis、VP9 + Opus 或 VP9 video-only。

运行测试：

```bash
pnpm --filter @anyfile/browser-video-viewer test
```

固定样例及再分发依据见 [`examples/README.md`](examples/README.md)。阶段 0/1 的跨浏览器证据和未支持范围仍以 `docs/videos/support-matrix.md` 为准。
