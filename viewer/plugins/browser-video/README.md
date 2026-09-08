# 浏览器视频查看器 (`browser-video`)

使用浏览器原生媒体元素播放本地 ISO BMFF 与 WebM 视频。

## 基本介绍

- **插件 ID**：`browser-video`
- **格式入口**：`.mp4`、`.m4v`、`.mov`、`.qt`、`.3gp`、`.3g2`、`.webm`
- **能力**：播放、暂停、进度跳转及浏览器原生音量控制；检查容器、音视频轨道和编码。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 通过有界容器探测识别真实轨道与编码，避免仅凭扩展名判断可播放性。
2. [src/index.ts](src/index.ts) 为原始文件创建 Object URL，交给 `<video controls>` 加载；不在插件中整文件复制或转码。
3. 销毁时停止媒体播放、移除事件监听并释放 Object URL。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

没有第三方视频解码器或 WASM；原始媒体由浏览器解码。

## 已知限制

- 声明组合：MP4/M4V 的 AVC + AAC-LC、AVC 无音轨、HEVC + AAC-LC、AV1 + AAC-LC；MOV/QuickTime 与 3GP/3G2 的 AVC + AAC-LC；WebM 的 VP8 + Vorbis、VP9 + Opus、VP9 无音轨。
- 解码能力依赖浏览器、操作系统和设备，扩展名相同不代表任意编码均可播放。
- 不承诺字幕、多轨选择、HDR 色彩和专业时间线语义；组合级验证范围见[视频支持矩阵](../../../docs/videos/support-matrix.md)。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/browser-video-viewer test
```
