# DICOM 查看器

实现位于 `viewer/plugins/dicom`，支持 `.dcm` / `.dicom` 的 DICOM Part 10 文件。文件只在浏览器读取，没有网络上传、编辑或导出。

## 已实现范围

- 原生 Implicit VR Little Endian、Explicit VR Little Endian、Explicit VR Big Endian。
- 8/16-bit MONOCHROME1/2：Bits Stored/High Bit、有符号像素、Rescale Slope/Intercept、Pixel Padding；默认窗口或忽略 padding 的自动窗口。
- LINEAR（含 width=1 阈值）、LINEAR_EXACT、SIGMOID；窗宽/窗位手动输入，当前 UI 窗宽最小为 1。
- 8-bit RGB，交错或 planar 像素排列。
- 单文件多帧按需切换；共享视口提供缩放、平移、旋转和键盘操作。
- 检查类型、日期、SOP Class、传输语法、尺寸、位深、帧数和光度解释。

有界 probe 最多读取 64 KiB 文件头，不读完整像素，也不初始化 Worker/Canvas。能确认原生影像可显示时等级为 3；不支持的变体或超出 probe 范围的头按等级 1 候选，open 再独立校验。不能将此等级视为医学诊断或完整标准符合性认证。

## 明确限制

- JPEG/JPEG-LS/JPEG 2000/RLE 等压缩影像仅展示元数据；deflated/未知数据集语法仅展示文件元信息，禁止进入解析器无上限的解压路径。
- Palette Color、YBR、1-bit、浮点等像素类型不渲染。
- Modality/VOI LUT、增强影像 shared/per-frame functional groups、非 IDENTITY presentation LUT shape 等变换只提供元数据，不忽略这些变换后显示错误影像。
- 不扫描关联文件、不组织跨文件序列、不读取 DICOMDIR、不做三维重建或测量；无 Part 10 前导标记、无扩展名文件不在声明范围。
- 当前按像素网格显示；不校正非方形像素间距，不提供患者方位标注或色彩管理。支持等级为 3，不宣称完整领域查看。

## 资源与生命周期

- Worker 内解析最多 8 MiB 文件头，遇到 Pixel Data 停止；帧通过 `File.slice()` 独立读取。没有整文件 `arrayBuffer()`，大文件不必完整驻留内存。
- 每帧最多 16 Mi pixels（16,777,216 像素），8/16-bit 灰度最多 32 MiB 原始帧，RGB 最多 48 MiB，RGBA 最多 64 MiB；只保留当前显示帧，不建立全序列缓存。
- 校验帧数、尺寸、位深、像素区长度和文件范围；损坏输入返回稳定的本地化错误，不展示解析器原文。
- 取消和 dispose 终止 Worker、拒绝未完成请求、释放视口/Canvas/监听器并移除根节点。帧请求期间禁用相关输入，局部失败保留上一帧并标明失败。
- `dicom-parser@1.8.21`（MIT）只进入延迟的 probe/Worker 代码，不进入页面外壳。许可随 prepare 发布到 `/vendor/licenses/dicom-parser/1.8.21/LICENSE`。

## 验证记录（2026-10-04）

- 插件测试覆盖三种原生语法、存储位与符号位、重标定、灰度反转、padding、RGB 两种排列、多帧、窗函数、元数据降级、损坏/超限和取消/重复释放。
- pydicom 公开 `CT_small.dcm`：128×128 CT 解码通过（临时下载验证，没有复制进仓库或作为联网单测依赖）。来源：<https://github.com/pydicom/pydicom/blob/main/src/pydicom/data/test_files/CT_small.dcm>。
- 使用真实 Chrome 验证本地生产构建的合成多帧样例，确认灰度/RGB 画布显示、帧切换、缩放、旋转、窗宽调整及元数据降级。640×480 窗口收起文件栏后通过比例检查；固定缩放百分比字段宽度，避免工具栏换行与 fit 缩放互相触发布局抖动。
- 样例位于 `viewer/plugins/dicom/examples`，用该目录下 `generate.mjs` 重新生成，不含患者信息。它们用于显示链路测试，不代表完整临床 IOD 合规样例。
- 仍需用户用实际来源文件验收少见设备变体；不将合成样例和单个 CT 样例视为全格式覆盖。
