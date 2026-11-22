# Insta360 全景查看器 (`insta360`)

面向已验证的 Insta360 X3、One RS、X4、X5、X6 布局，提供本地全景查看。

## 基本介绍

- **插件 ID**：`insta360`
- **格式入口**：`.insp`、`.dng`、`.lrv`、`.insv`
- **能力**：INSP 照片、LRV 代理视频、INSV 单文件双轨或配对视频，以及已识别布局的 DNG 全景。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. 有界探测通过顶层 MP4 box 长度定点计算尾部 `moov` 偏移，不扫描或整体载入大文件。INSP 覆盖 X3 5952×2976 并排双鱼眼 JPEG；LRV 覆盖 X3 1024×512 和 X4 1664×832 AVC 代理视频（X4 LRV 使用 40 点拟合标定）。
2. INSV 覆盖 X3 2880×2880 / One RS 3072×3072 的严格配对 `VID_YYYYMMDD_HHMMSS_00|10_<num>.insv`（通过 `WorkspaceReader` 关联，`_00` 作音频主时钟、`_10` 静音，取较短时长，`0.97/1.03` 倍速纠偏与 >180 ms 硬同步，缺配对返回 `missing-related-file`）、One RS 768×384 代理，以及 X4/X5/X6 双 3840×3840 HEVC + AAC 单文件布局。
3. 单文件双轨 HEVC 优先使用 Mediabunny + WebCodecs + Web Audio 播放；浏览器无法原生解码时按需回退到共享 `@anyfile/ffmpeg-playback` 的 `openPanorama` 软件路径（输出双 1920² BT.709 I420，4-Worker pthread 池需 `SharedArrayBuffer` 与跨源隔离，256 MiB 显示队列，不保证实时）；仍不可用且文件含内嵌帧时降级为 1280×640 I420 静态 360° 预览。
4. 投影模型使用等距鱼眼（X3 照片 `thetaMax=98.5°` / 视频 `95.75°`、`blend=8°`）；X4/X5 读取文件尾部 protobuf `offset_v3` MEI 逐镜头标定，X6 使用机型常量。支持方向键环顾、`+`/`-` 调 FOV、`0` 重置、空格播放/暂停。
5. DNG 覆盖 X3 2976×5952 上下布局和 X6 15520×7760 并排布局；X6 的 31 条 Adobe Deflate 条带在专用 Worker 中解码为 2×2 CFA 半分辨率预览（绕过 LibRaw 64 MP 限制）。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/browser-video-viewer` | 复用 ISO BMFF / WebM 容器检查 |
| `@anyfile/ffmpeg-playback` | 双轨 HEVC 的软件回退解码（`openPanorama`） |
| `@anyfile/raw-decoder` | 共享 LibRaw WASM 解码与 RAW 预览 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `mediabunny@1.55.3` | 媒体容器读取、轨道访问与解码接口 |

RAW、Mediabunny 与 FFmpeg 回退均随实际格式路径按需加载。

## 已知限制

- WebCodecs 不可用时，软件回退需要跨源隔离与 `SharedArrayBuffer` 且不保证实时播放；若解码环境仍不可用，支持的文件降级显示内嵌 1280×640 I420 静态 360° 预览（绝不掩盖损坏或超限错误）。
- 尚未应用陀螺仪水平校正和 FlowState；未识别的 DNG 布局继续交由通用 camera-raw。
- 配对视频的关联读取需要工作区；已验证分辨率与布局不代表同扩展名的全部机型和模式。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/insta360
```
