# DJI Osmo 全景查看器 (`dji-osmo`)

针对已验证的 DJI Osmo 360 布局，提供本地交互式全景查看与播放。

## 基本介绍

- **插件 ID**：`dji-osmo`
- **格式入口**：`.jpg`、`.jpeg`、`.osv`
- **能力**：Osmo / OQ001 的 15520×7760 GPano 等距柱状 JPEG；OSV 双 3840×3840 HEVC Main 10 鱼眼轨道及 AAC 双声道音频。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. Manifest、轻量探测与完整实现分别导出，按文件内容识别已验证布局。
2. OSV 使用 Mediabunny 本地 range 读取、WebCodecs 解码、Web Audio 音频调度及 WebGL 双鱼眼投影。
3. 视频投影的镜头焦距、光心和平面内旋转参数由三份已有 OSV 样例联合标定；无需上传或整文件复制。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/browser-video-viewer` | 复用 ISO BMFF / WebM 容器检查 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `mediabunny@1.55.3` | 媒体容器读取、轨道访问与解码接口 |

全景投影与媒体会话复用共享渲染包，Mediabunny 仅用于完整媒体实现。

## 已知限制

- 当前范围以已验证机型和轨道布局为限，不代表任意 DJI 视频。
- 未应用陀螺仪稳定、DJI 私有元数据或 HDR 精确输出。
- DJI OP-041 DNG 是普通 Osmo Pocket RAW 照片，由 camera-raw 处理；HEVC 解码依赖浏览器和设备。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/dji-osmo-viewer test
```
