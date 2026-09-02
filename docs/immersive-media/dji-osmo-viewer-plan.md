# DJI Osmo 360 查看器实现记录

- 状态：JPEG 已验证；OSV 已实现，待目标浏览器真实连续播放复验
- 范围：`Osmo / OQ001` 等距柱状 JPEG 与 OQ001 双鱼眼 `.osv`
- 非目标：Osmo Pocket `OP-041` DNG、编辑、导出、服务端转码、厂商私有元数据解释

## 1. 路由边界

独立 `@anyfile/dji-osmo-viewer` 插件声明 `.jpg`、`.jpeg` 与 `.osv`。同扩展名竞争依靠有界内容 probe：

- JPEG 必须同时满足 15520×7760、EXIF `Make=Osmo`、`Model=OQ001`，以及 GPano `ProjectionType=equirectangular`、`UsePanoramaViewer=True`；
- OSV 必须是 MP4/ISOBMFF，头部含 OQ001/Osmo 360 标识，`moov` 含 DJI `djmd` 与 `dbgi`，并具有两条 3840×3840 HEVC 主视频轨和 AAC 48 kHz 双声道；
- `DJI / OP-041` DNG 不满足全景布局，专用 probe 返回 0，由 `camera-raw` 插件继续处理。

JPEG 返回等级 5：文件已经机内拼接成完整 2:1 等距柱状图，查看器提供完整球面导航。OSV 返回等级 3：画面、主音频、播放、seek 与球面导航已经实现，但不应用 gyro、防抖、HDR 精确输出或 DJI 私有元数据。

## 2. 大文件与容器

三个真实 OSV 的顶层布局均为：

```text
ftyp → free → free → mdat → moov → camd
```

最大样例超过 4 GiB，`mdat` 使用 64-bit extended size。probe 读取 64 KiB 头部，从顶层 box 长度计算 `moov` 偏移，再读取 16-byte box 头和不超过 2 MiB 的 `moov`。完整播放由 Mediabunny 的 `BlobSource` 以最多 8 MiB cache 分段读取；不读取完整 `camd`，也不把源文件整体复制到内存。

真实样例共同包含：

- 两条 3840×3840 `hvc1` HEVC Main 10、10-bit 4:2:0 镜头轨；
- 25 或 29.97 fps；
- AAC-LC、48 kHz、双声道主音频；
- 四条 `djmd` / `dbgi` 私有数据轨；
- 一条 344×612 或 688×344 MJPEG 缩略轨。

播放路径只选择两条 HEVC 镜头轨与 AAC 主音频，明确忽略缩略视频和私有数据轨。

## 3. 投影标定

原调研原型使用两镜头统一 100° 半视场、居中光心和固定圆半径，适合验证方向但接缝质量有限。本实现用 FFmpeg 从三段真实 OSV 各抽取同步双轨帧，在左右两条重叠带上联合比较跨镜头像素相关性，拟合独立的等距鱼眼参数：

```text
lens 0: focal=0.2902677464, center=(0.5018217246, 0.5017294851), rotation=-0.324°
lens 1: focal=0.2882550974, center=(0.5047001077, 0.5061643697), rotation=-0.365°
thetaMax=100°, blend=8°
```

三个样例的相关性都高于原型默认参数。该结果是基于现有 OQ001 样例的实测标定，不宣称等价于 DJI 出厂标定。片元着色器从当前视口射线直接计算两个鱼眼 UV，在重叠区平滑混合，不生成 8K 等距柱状中间视频。

## 4. 资源与生命周期

- JPEG 解码宽度限制为 `min(8192, WebGL MAX_TEXTURE_SIZE)`，保留 2:1 比例；
- OSV 每路 `CanvasSink` pool 为 2，音频预排约 1 秒，以 Web Audio 时钟协调双视频轨；
- UI 支持拖动、滚轮、方向键、重置、播放、暂停、音量与 seek；
- 进度条拖动阶段只更新目标时间，松手后才提交解码；seek 严格串行并跳过过时请求，避免两路 4K HEVC 随拖动事件并发堆积；
- abort 与幂等 dispose 释放 Mediabunny Input、异步 iterator、AudioContext、音频节点、WebGL texture/program/buffer、动画帧、监听器、ImageBitmap 和插件 DOM；
- manifest/probe 不静态加载 Mediabunny、播放器或 WebGL UI，构建门禁检查动态边界。

## 5. 验收

自动测试覆盖：相机 JPEG 识别、OSV/伪装 MP4/错误轨道布局、probe 读取预算、投影方向、图片和视频生命周期、DOM 所有权与重复 dispose。真实样例已完成 FFprobe/ExifTool 结构核验、FFmpeg 双轨抽帧与投影标定。

OSV 在目标浏览器标为 `verified` 前还需实际验证首帧、至少 30 秒连续播放、非静音 AAC、前后及快速 seek、结束/重播、resize、窄/矮窗口、切换文件与 active abort。
