# DICOM 查看器 (`dicom`)

支持 `.dcm` / `.dicom` 的 DICOM Part 10 文件。文件只在浏览器读取，没有网络上传、编辑或导出。

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

## Agent extract

`src/extract.ts` 在 Node 中复用 `inspectDicom()` / `renderFrame()`（与 Worker 相同的解析与窗宽窗位逻辑），实现 `inspect` / `read` / `renderImage`：

- `inspect`：传输语法、SOP Class、Modality、检查日期、检查/序列描述等描述性标签，Rows/Columns、帧数、位深、光度解释、默认窗宽窗位和是否可渲染。
- `tags`：`Tag | Keyword | VR | Value` 表格，支持 `filter`，`row:<n>` 游标；Pixel Data 和二进制值只显示长度，序列只显示条目数、不展开。
- `frame:<n>`：`read` 返回该帧摘要；`renderImage` 用文件默认窗宽窗位（缺省时按像素范围自动）输出 RGBA，并按 `maxDimension` 缩小。
- **默认屏蔽身份信息**：患者组 (0010,xxxx) 除性别、年龄、身高、体重外全部显示为 `<masked>`（姓名、ID、出生日期、地址等），所有 PN 人名、私有标签、机构/科室/工作站名称、Accession Number、Study ID 同样屏蔽；`inspect` 不输出任何患者标签。
- 压缩传输语法（JPEG/JPEG-LS/JPEG 2000/RLE）、deflated 数据集及其他“仅元数据”影像，`renderImage` 返回 `unsupported-capability`；deflated/未知语法只解析文件元信息组。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- [examples/](examples/) 为 `generate.mjs` 生成的合成样例，不含患者信息，只用于显示链路测试，不代表完整临床 IOD 合规。
- 公开真实样例可用 pydicom `CT_small.dcm`（<https://github.com/pydicom/pydicom/blob/main/src/pydicom/data/test_files/CT_small.dcm>）临时下载验证，不复制进仓库。

```bash
pnpm test viewer/plugins/dicom
```
