# Insta360 全景查看器 (`insta360`)

面向已验证的 Insta360 X3、One RS、X4、X5、X6 布局，提供本地全景查看。

## 基本介绍

- **插件 ID**：`insta360`
- **格式入口**：`.insp`、`.dng`、`.lrv`、`.insv`
- **能力**：INSP 照片、LRV 代理视频、INSV 单文件双轨或配对视频，以及已识别布局的 DNG 全景。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. INSP 覆盖 X3 5952×2976 并排双鱼眼 JPEG；LRV 覆盖 X3 1024×512 和 X4 1664×832 AVC 代理视频。
2. INSV 覆盖 X3 2880×2880 / One RS 3072×3072 的 `_00`/`_10` AVC 配对、One RS 768×384 代理，以及 X4/X5/X6 双 3840×3840 HEVC + AAC 单文件布局；关联文件通过授权工作区读取。
3. 单文件双轨通过 Mediabunny、WebCodecs 和 Web Audio 按需播放；X4/X5/X6 从各文件 protobuf 尾部索引读取逐镜头 MEI 标定。
4. DNG 覆盖 X3 2976×5952 上下布局和 X6 15520×7760 并排布局；X6 Adobe Deflate 条带在 Worker 中解码为宽高减半的 CFA 预览。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/browser-video-viewer` | 复用 ISO BMFF / WebM 容器检查 |
| `@anyfile/raw-decoder` | 共享 LibRaw WASM 解码与 RAW 预览 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |
| `mediabunny@1.55.3` | 媒体容器读取、轨道访问与解码接口 |

RAW 路径复用 `@anyfile/raw-decoder`，媒体和全景交互复用共享渲染包；各实现随格式路径按需加载。

## 已知限制

- 不能解码 3840×3840 HEVC 时，支持的文件可改用其索引中的 1280×640 I420 等距柱状帧，界面明确标注为静态 360° 预览。
- 尚未应用陀螺仪水平校正和 FlowState；未识别的 DNG 布局继续交由通用 camera-raw。
- 配对视频的关联读取需要工作区；已验证分辨率与布局不代表同扩展名的全部机型和模式。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/insta360-viewer test
```
