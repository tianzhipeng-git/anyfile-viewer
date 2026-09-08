# FFmpeg 播放验证

当前架构、支持范围与资源预算见[FFmpeg 音视频播放架构](ffmpeg-playback-runtime-plan.md)。

## 浏览器验证

[原始结果](evidence/ffmpeg-playback-browser.json)：2026-09-05，Playwright Chromium 145.0.7632.6 / Darwin 24.6.0 arm64。测试运行生产构建的 `/en/view` 页面，阻断 R2 请求以验证同源回退。

| 范围 | 通过项 |
|---|---|
| 视频 | AVI MPEG-4 Part 2 + MP3、1080p、video-only；真实 Canvas 首帧与连续不同帧 |
| 音频 | AIFF 16/24-bit、AIFC float32；analyser 非静音输出、有效静音、拒绝非有限 PCM |
| 调度 | 首段视频时间戳与音频驱动位置误差小于 150 ms；暂停后静音且位置不变；音量 0/1 |
| 交互 | 前后及快速连续 seek、结束、重播、窄/矮窗口 |
| 清理 | 切换后释放 Worker/AudioContext |

自动测试另覆盖独立有界 probe、格式反例、初始化回退、文件错误不回退、同步解码超时、打开中取消、活动取消、重复 dispose 和无用户手势的静音打开。

Safari、Firefox、移动端与长时间播放的 CPU/进程峰值内存尚无实测。底层解码吞吐、WASM heap 和大于 4 GiB 的随机读取结果见[运行时测量](ffmpeg-runtime-spike-evidence.md)，不代表对应媒体的完整播放验证。

## 复现

```sh
pnpm test
pnpm lint
pnpm build
# 另一个终端运行 pnpm start --port 3147
node scripts/verify-ffmpeg-browser.mjs
```

## R2 资产与播放验证

`9.0.1-anyfile.1` 的 12 个文件发布于 `anyfile-bucket/vendor/ffmpeg-playback/9.0.1-anyfile.1/`，公开地址为 `https://assets.anyfile.top/vendor/ffmpeg-playback/9.0.1-anyfile.1/`。[公开资产校验](evidence/ffmpeg-r2-assets.json)确认全部文件 SHA-256 一致，MIME、CORS/CORP、immutable 缓存和 GET 缓存命中符合约定。

2026-09-06 的[Chromium 验证](evidence/ffmpeg-r2-browser.json)在本地生产构建中禁止同源 glue/WASM 回退，实际从 R2 加载运行时；上表播放、seek、重播与清理检查全部通过。该验证覆盖 R2 跨源加载，不覆盖已部署网站的 CSP。
