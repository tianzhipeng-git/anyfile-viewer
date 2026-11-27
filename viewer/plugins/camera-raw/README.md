# 相机 RAW 查看器 (`camera-raw`)

## 基本介绍

- **插件 ID**：`camera-raw`
- **格式入口**：`.dng`、`.cr2`、`.cr3`、`.crw`、`.nef`、`.nrw`、`.arw`、`.sr2`、`.srf`、`.raf`、`.orf`、`.pef`、`.rwl`、`.raw`、`.rw2`

支持 DNG、CR2、CR3、CRW、NEF、NRW、ARW、SR2、SRF、RAF、ORF、PEF、RWL、RAW 和 RW2，可查看相机信息、内嵌预览，并在浏览器本地生成基础显影结果。

## 实现原理

插件先读取最多 1 MiB 文件头识别格式，再把完整文件交给 LibRaw WASM。优先显示内嵌缩略图，同时异步执行 8-bit sRGB 基础显影；显影使用相机白平衡、相机矩阵和文件方向。结果通过 Canvas 视口显示，并支持缩放、旋转和适应窗口。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/raw-decoder` | 共享 LibRaw WASM 解码与 RAW 预览 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `@anyfile/viewer-rendering` | 共享图片、音频或全景视口与资源管理 |

`@anyfile/raw-decoder` 封装 `libraw-wasm@1.6.0`，负责解析、元数据、缩略图与基础显影。其 pthread WASM 要求 `/view` 启用跨源隔离，详见[共享 RAW 解码器](../../raw-decoder/README.md)。

## 已知限制

- 输入最大 256 MiB，解码后最大 64 Mi 像素；完整文件会读入内存，解码初始化最多等待 60 秒。
- 输出仅用于预览，不等同于具备完整色彩管理、镜头校正和编辑能力的专业 RAW 软件。
- 当前交付能力按代表性预览等级 2 计：可显示内嵌预览并生成基础显影，但不承诺专业 RAW 软件的完整色彩、镜头和型号语义。型号级自动回归仅覆盖 [examples/](examples/README.md) 中的 CC0 DNG；样例能否提交或再分发不作为格式支持与否的判断条件。
- `libraw-wasm` 包装层采用 ISC 许可证；编译依赖仍保留各自许可证，包括 LibRaw 的 CDDL-1.0/LGPL-2.1 双许可证。

## Agent 提取（`./extract`）

[src/extract.ts](src/extract.ts) 在 Node 中经 `@anyfile/raw-decoder` 的 `loadLibRawFromVendor()` 直接加载 `libraw/1.6.0/libraw.js` + `libraw.wasm`（不经浏览器 Worker），与浏览器使用同一份 vendor 产物和显影参数。

- `inspect`：格式、厂商、型号、镜头、ISO、快门、光圈、焦距、拍摄时间、尺寸（按 `flip` 换算）、RAW 尺寸、CFA、DNG 版本、内嵌预览尺寸与格式、软件、机身序列号、GPS 是否存在；文件未记录的字段省略。目标仅 `metadata`，`read` 输出分页 Markdown，支持 `filter`。
- `renderImage`：LibRaw 半尺寸显影（相机白平衡与矩阵、sRGB、按文件方向），box 滤波缩到 `maxDimension`。不使用内嵌 JPEG 预览：Node 侧没有 JPEG 解码器。
- 沿用上文 256 MiB 输入、64 Mi 像素上限；整文件读入内存。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)、[样例说明](examples/README.md)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/camera-raw
```
