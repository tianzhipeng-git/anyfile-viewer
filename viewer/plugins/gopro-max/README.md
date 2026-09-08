# GoPro MAX 全景查看器 (`gopro-max`)

针对已验证的 GoPro MAX/MAX2 布局，提供本地全景照片查看和视频播放。

## 基本介绍

- **插件 ID**：`gopro-max`
- **格式入口**：`.jpg`、`.jpeg`、`.360`
- **能力**：GoPro Max EXIF 的 5760×2880 等距柱状 JPEG；MAX 4096×1344 或 MAX2 5952×1920 双 HEVC EAC 视频轨道，搭配 AAC 双声道音频。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 有界识别照片与视频布局，完整实现在选中插件后加载。
2. 视频通过 Mediabunny range 读取，WebCodecs 解码与 Web Audio 播放，再投影为交互式全景。
3. 直接读取本地文件范围，不将原始文件整体复制到内存；销毁时释放媒体与图形资源。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/browser-video-viewer` | 复用 ISO BMFF / WebM 容器检查 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `mediabunny@1.55.3` | 媒体容器读取、轨道访问与解码接口 |

媒体解析由 Mediabunny 提供；投影、音画播放与交互使用共享渲染基础设施。

## 已知限制

- 仅承诺已验证布局，不能由 `.360` 扩展名推导所有机型均受支持。
- 未使用额外 Ambisonic PCM 音轨、GPMF 遥测、陀螺仪水平校正或防抖元数据。
- HEVC 播放能力依赖浏览器和设备；不提供 GoPro 专业后期编辑功能。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/gopro-max-viewer test
```
