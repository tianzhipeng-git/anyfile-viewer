# Insta360 全景文件查看支持方案

- 状态：阶段 1–3 已实现；阶段 4–5 规划中
- 首批目标设备：Insta360 X3
- 适用范围：浏览器本地查看 `.insp`、`.lrv`、成对 `.insv` 与 Insta360 `.dng`
- 非目标：编辑、导出、服务端转码、自动 HDR 合成、完整复刻 Insta360 Studio
- 隐私边界：文件只在浏览器本地读取和渲染，不上传到服务器或第三方服务

## 1. 结论

新增独立的 `@anyfile/insta360-viewer` 领域插件，不把全景拼接逻辑塞进现有通用图片、视频或相机 RAW 插件。

首期只声明经过真实样本验证的 Insta360 X3 文件布局。其他 Insta360 型号即使使用相同扩展名，也不能直接套用 X3 的镜头参数；后续应通过真实样本、设备元数据和型号级 calibration profile 逐步扩展。

推荐实施顺序：

1. `.insp` 全景照片；
2. `.lrv` 低分辨率全景视频；
3. 多文件工作区与成对 `.insv` 高清视频（已完成）；
4. Insta360 `.dng` RAW 全景；
5. 陀螺仪、水平校正、FlowState 和更多设备型号。

## 2. 已验证的样本结构

本方案基于 `/Users/tianzhipeng/Desktop/testinsta360` 中的 Insta360 X3 样本、旧版 WebGL 查看器、二进制头、EXIF 和 FFprobe 结果。

| 文件 | 实际容器和编码 | 样本布局 | 浏览器处理路径 |
|---|---|---|---|
| `.insp` | JPEG + Insta360 尾部元数据 | 5952×2976，左右双鱼眼 | 浏览器图片解码 → WebGL |
| `.lrv` | ISO BMFF/MP4，H.264 + AAC | 1024×512，左右双鱼眼 | 单个 `<video>` → WebGL |
| `.insv` | ISO BMFF/MP4，H.264 + AAC | 每个文件一个 2880×2880 鱼眼，`_00`/`_10` 成对 | 两个 `<video>` → WebGL |
| `.dng` | 16-bit TIFF/DNG RAW | 2976×5952，上下双鱼眼 | LibRaw 显影 → WebGL |

样本中的 `.insv` 视频为 H.264 Main、2880×2880、29.97 fps、8-bit 4:2:0、full range，并包含 AAC-LC 48 kHz 双声道音频。两个镜头文件时长接近但不完全相同。

### 2.1 命名与关联文件

当前样本使用以下命名方式：

```text
IMG_20230815_194449_00_797.insp
IMG_20230815_194449_00_797.dng

VID_20230813_194503_00_713.insv
VID_20230813_194503_10_713.insv
LRV_20230813_194503_11_713.lrv
```

高清全景视频需要同一次录像的 `_00` 与 `_10` 两个 `.insv` 文件。配对时必须同时校验时间戳、录像编号和段号，不能仅因为目录中存在两个 `.insv` 就自动组合。

同时间戳的多个 DNG 可能属于曝光括号，但首期不据此自动合成 HDR。

### 2.2 视频容器的特殊读取位置

样本顶层结构为：

```text
ftyp → mdat → moov → free
```

`moov` 位于 `mdat` 后，但距离文件末尾约 5–6 MiB。现有视频 probe 的“头部 256 KiB + 尾部 256 KiB”无法直接读取它。

Insta360 probe 应先读取文件头中的顶层 box 长度，根据 `mdat` 的声明大小计算 `moov` 偏移，再对该位置执行有界分片读取。不能为了找到 `moov` 扫描整个 180 MiB 文件。

## 3. 拼接与观察原理

旧版查看器采用实时 WebGL 双鱼眼拼接，而不是先转换并生成完整等距柱状视频。

### 3.1 等距鱼眼模型

对世界方向单位向量 `d`，单镜头采用等距鱼眼投影：

```text
theta = acos(clamp(dot(d, forward), -1, 1))
r = theta / thetaMax × 0.5
```

X3 样本当前使用：

```text
thetaMax = 105°
单镜头完整 FOV = 210°
```

镜头坐标约定：

```text
lens0: forward=(0,0,-1), right=( 1,0,0)
lens1: forward=(0,0, 1), right=(-1,0,0)
up:    (0,1,0)
```

### 3.2 接缝混合

两个镜头均覆盖的区域根据方向到各自光轴的角度差进行平滑混合。当前样本使用约 8° 的混合宽度。

旧项目与 FFmpeg `v360` 输出的整体 NCC 约为 0.99，可以证明投影手性和主要方向基本正确，但不能证明：

- 所有拍摄距离下的接缝都准确；
- 镜头光学中心恰好位于图像中心；
- 两个镜头不存在曝光和白平衡差异；
- 这些参数适用于其他 Insta360 型号。

因此首期能力应诚实标记为 X3 的主要内容查看，而不是所有型号的完整精确拼接。

### 3.3 观察视口

查看器不需要生成一张完整等距柱状中间图。片元着色器可以直接执行：

```text
屏幕像素
  → 相机射线
  → yaw / pitch / FOV 旋转
  → 两个鱼眼 UV
  → 纹理采样与接缝混合
  → 当前观察视口
```

这条路径避免生成高分辨率全景中间帧，适合图片和连续视频共用。

## 4. 旧版查看器不能直接移植的部分

旧版原型证明了核心投影方案可行，但没有达到本项目的正式插件要求：

- 镜头参数固定为 X3，没有型号级能力边界；
- 两个 `.insv` 视频都被静音，没有交付文件应有的主音频；
- 双视频同步仅在偏差超过 120 ms 后硬设 `currentTime`，容易产生卡顿；
- `.dng` 依赖预先转换的 JPEG，网页本身没有解码 RAW；
- 没有使用陀螺仪数据，不包含 FlowState、防抖或水平校正；
- 没有完整处理 opening abort、active abort、重复 dispose 和媒体错误；
- Object URL、媒体解码状态、动画帧和 GPU 资源没有统一清理；
- WebGL 上传异常被静默忽略，会掩盖真实失败；
- UI、样式、本地化、键盘操作和错误码不符合当前插件协议。

旧代码应作为数学和样本分析依据，不应原样复制进生产插件。

## 5. 插件架构

建议目录：

```text
viewer/plugins/insta360/
├── package.json
├── src/
│   ├── manifest.ts
│   ├── probe.ts
│   ├── format-inspection.ts
│   ├── pairing.ts
│   ├── panorama-renderer.ts
│   ├── image-source.ts
│   ├── video-source.ts
│   ├── ui.ts
│   └── index.ts
└── examples/
```

保持以下加载边界：

```text
manifest
└── 纯数据，进入宿主初始代码

probe
└── 仅在扩展名命中后动态加载，执行有界格式识别

完整插件
└── 仅在成为默认或用户选中的查看器后加载 DOM、媒体和 WebGL
```

### 5.1 Manifest

首期声明扩展名：

```text
.insp
.lrv
.insv
.dng
```

`workspaceAccess` 使用 `optional`：

- `.insp`、`.lrv` 和单个 `.dng` 不需要关联文件；
- `.insv` 需要在 `open()` 中查找配对文件；
- 没有工作区或找不到配对文件时返回 `missing-related-file`。

### 5.2 Probe

Probe 只负责识别和排序，不创建 DOM、媒体元素或 WebGL context。

`.insp`：

- 检查 JPEG magic；
- 有界解析 SOF 尺寸；
- 有界解析 EXIF Make/Model；
- 首期只接受明确的 Arashi Vision / Insta360 X3 双鱼眼布局。

`.lrv` / `.insv`：

- 检查 ISO BMFF `ftyp`；
- 根据顶层 box 长度精确读取 `moov`；
- 复用现有 browser-video 导出的 ISO BMFF container inspection；
- 校验主视频、主音频、codec、尺寸和声明布局；
- `.insv` 额外校验 `_00`/`_10` 命名角色。

`.dng`：

- 检查 TIFF/DNG magic；
- 校验 DNG 标记、相机 Make/Model 和 TB 双鱼眼尺寸；
- 仅 Insta360 DNG 返回全景查看等级，其他 DNG 返回 0，继续交给通用 camera-raw 插件。

建议初始支持等级：

| 格式 | 初始等级 | 原因 |
|---|---:|---|
| X3 `.insp` | 3 | 主要内容可全景查看，但缺少精确型号校准、水平校正和高质量接缝 |
| X3 `.lrv` | 3 | 完整低清画面、音频和 seek 可用，但它本身是代理视频 |
| 成对 X3 `.insv` | 3 | 高清主要节目、音频和 seek 可用，仍缺少 gyro、防抖和高级语义 |
| X3 `.dng` | 3 | 可基础显影并全景查看，但没有专业色彩、HDR 合成和精确校准 |

## 6. WebGL PanoramaRenderer

`PanoramaRenderer` 保持在 Insta360 插件内部。现有 `InteractiveViewport` 表达的是二维图片的平移、缩放和 90° 旋转，不适合球面相机，不应强行扩展。

可以复用 `@anyfile/viewer-rendering` 的 `ResourceScope`，集中登记事件监听、ResizeObserver、动画帧和清理函数。

Renderer 负责：

- WebGL context、shader、program、buffer 和 texture；
- yaw、pitch、FOV 与宽高比；
- SBS、TB 和双纹理三种输入布局；
- 纹理上传与新视频帧调度；
- DPR 与容器 resize；
- 拖拽、滚轮和键盘操作；
- context lost、环境能力和资源上限错误；
- 幂等释放所有 GPU 资源。

### 6.1 纹理策略

`.insp` 和 `.dng` 不直接上传 5952 像素长边的整图。图片解码后裁成两个约 2976×2976 的 `ImageBitmap`，分别上传为镜头纹理。

这样可以：

- 降低单纹理最大边长要求；
- 让图片与双 `.insv` 使用相同的双纹理 shader 路径；
- 减少 SBS/TB 分支对 GPU 能力的影响。

打开前读取 `MAX_TEXTURE_SIZE`。无法容纳单镜头纹理时，首期返回明确的 `unsupported-environment` 或 `resource-limit`，不静默显示损坏画面。

## 7. 各格式数据路径

### 7.1 `.insp`

```text
File
  → 有界 JPEG/EXIF 校验
  → 带 image/jpeg MIME 的 Blob view
  → 图片解码
  → 裁成左右两个 ImageBitmap
  → PanoramaRenderer
```

使用 `file.slice(0, file.size, "image/jpeg")` 建立正确 MIME 的 Blob view，不为了改 MIME 复制完整文件。

### 7.2 `.lrv`

```text
File
  → 有界 BMFF/track 校验
  → 带 video/mp4 MIME 的 Blob view
  → 单个 video 元素
  → SBS 视频纹理
  → PanoramaRenderer
```

视频不自动播放。原文件的 AAC 音轨作为主音频保留。

### 7.3 成对 `.insv`

```text
当前 _00 或 _10 文件
  → workspace.list() 查找同组文件
  → workspace.open() 读取配对文件
  → 分别复验容器、codec、尺寸和角色
  → 两个 video 元素
  → 两张视频纹理
  → PanoramaRenderer
```

播放策略：

- `_00` 作为主时钟和唯一音频源；
- `_10` 永久静音，只提供另一个镜头画面；
- 播放有效时长取两者较短值；
- seek 时同时定位；
- 小漂移优先通过短时 playbackRate 修正；
- 明显漂移才执行硬时间对齐；
- 任一镜头失败时停止播放并展示明确错误，不能继续显示冻结半球。

优先使用 `requestVideoFrameCallback` 驱动纹理更新；目标环境缺失时才回退到 `requestAnimationFrame`。

### 7.4 `.dng`

```text
File
  → 有界 DNG/相机型号校验
  → LibRaw 基础显影
  → 2976×5952 TB bitmap
  → 裁成上下两个 ImageBitmap
  → PanoramaRenderer
```

当前 camera-raw 插件已经封装 LibRaw 初始化、元数据、缩略图、基础显影和清理。出现 Insta360 这一第二个真实调用方后，应把最小 RAW decoder 能力提取为内部共享包，避免复制 Worker/WASM 生命周期和资源限制。

首期只展示单个 DNG 的基础显影全景，不自动合并曝光括号，不把结果称为专业 RAW 开发。

## 8. 多选文件的工作区

阶段 3 已实现以下行为：

- 打开文件夹时，插件可以通过 `WorkspaceReader` 读取当前文件同目录中的配对 `.insv`；
- 使用文件选择器一次选择多个文件时，宿主为该批文件构造顶层内存 `WorkspaceReader`；
- 再次执行“打开文件”或“打开文件夹”仍替换当前文件集合，不累计历史选择；
- 单独打开一个 `.insv` 时不建立只有自身的工作区，插件提示用户同时选择成对文件或打开整个文件夹。

实现没有修改公共协议：

```text
用户多选的 File / FileSystemFileHandle
  → 验证文件名在集合内唯一
  → 构造顶层 WorkspaceReader
  → list() 返回所选文件
  → open(name) 返回对应 File
```

涉及：

- `src/components/file-workspace.tsx`；
- `src/lib/workspace-reader.ts`；
- 对应工作区测试。

文件名按大小写不敏感判重；冲突时拒绝本次选择并显示明确错误，不静默选择其中一个。

## 9. UI 与交互

插件采用内部固定布局：

```text
root
├── toolbar：文件/型号/布局/状态
├── viewport：WebGL canvas
└── video controls：播放、seek、音量、时间
```

要求：

- 根节点 `height: 100%`、`min-height: 0`、`overflow: hidden`；
- 只有一个内容视口，不制造双滚动；
- 图片显示拖拽、缩放和重置方向；
- 视频显示播放、暂停、音量、seek、结束和重播；
- 不自动播放或发声；
- Canvas 可聚焦并提供键盘操作与可访问名称；
- 很窄或很矮的窗口仍能访问关键控件；
- 所有文案由 `context.locale` 选择，不读取 `navigator.language`。

建议键盘操作：

| 按键 | 行为 |
|---|---|
| 方向键 | 调整观察方向 |
| `+` / `-` | 缩放视野 |
| `0` | 重置观察方向与 FOV |
| 空格 | 视频播放/暂停 |

## 10. 生命周期与错误

插件 controller 必须幂等释放：

1. 标记实例失效；
2. 停止播放并移除媒体监听；
3. 清空两个 video 的 `src` 并调用 `load()`；
4. 撤销全部 Object URL；
5. 取消 `requestVideoFrameCallback` / `requestAnimationFrame`；
6. 断开 ResizeObserver；
7. 关闭 ImageBitmap；
8. 删除纹理、buffer、program 和 shader；
9. 移除插件根节点。

错误映射：

| 情况 | 错误码 |
|---|---|
| magic、容器、轨道、尺寸或型号不符合声明 | `invalid-file` |
| `.insv` 缺少正确配对文件 | `missing-related-file` |
| 浏览器不能解码 H.264/AAC、缺少 WebGL 或纹理能力不足 | `unsupported-environment` |
| RAW、图片尺寸或 GPU 分配超过已声明上限 | `resource-limit` |
| 无法归类的初始化失败 | `open-failed` |

取消保持标准 `AbortError`，不能包装成文件损坏。

## 11. 注册、内容和文档改动

实现插件时同步修改：

- `src/lib/viewer-registrations.ts`：注册轻量 probe 和完整插件动态入口；
- `src/content/manifests.ts`：加入轻量 manifest；
- `src/components/file-type-icon.tsx`：`.insp`/`.dng` 归图片，`.insv`/`.lrv` 归视频；
- 根 `package.json`：增加 workspace 插件依赖；
- `src/content/formats/`：新增 `.insp`、`.insv`、`.lrv` 内容页；
- DNG 内容页：说明识别为 Insta360 时由全景查看器接管；
- 图片、视频支持矩阵：记录具体型号、布局、codec、浏览器和已知限制；
- 加载部署门禁：确认 probe、完整 UI 和 WebGL 实现不进入 `/view` 首包。

同一 `insta360` manifest 跨图片和视频语义，文件图标不能简单把 manifest 的全部扩展名归入单一类别；需要按扩展名显式拆分图片和视频映射。

## 12. 测试与样例策略

当前实拍包含人物且文件很大，不应未经明确许可提交仓库。测试分为两层：

### 12.1 可提交的自动测试

- 合成 SBS/TB 双鱼眼图片；
- 合成短双镜头 H.264/AAC 视频；
- 合成或最小化 BMFF box fixture；
- 正常、损坏、截断、伪装和超限文件；
- `_00/_10` 正确配对和错误配对；
- DNG Make/Model 和布局路由；
- shader 方向、手性、UV 和混合权重的确定性测试；
- opening abort、active abort、重复 dispose；
- Object URL、媒体监听、动画帧、ImageBitmap 和 GPU 清理；
- DOM 所有权、本地化和无障碍测试。

### 12.2 本地真实样本验收

使用当前 X3 样本完成并记录：

- `.insp` 首屏和全方向浏览；
- `.lrv` 连续播放、非静音音频、seek、结束和重播；
- 双 `.insv` 30 秒连续播放、A/V sync、双镜头漂移和快速 seek；
- `.dng` 基础显影、上下镜头映射和资源峰值；
- 窄窗口、矮窗口、resize 和高 DPR；
- 文件切换、opening abort、active abort 和重复 dispose；
- 当前浏览器、操作系统、版本和验证日期。

## 13. 分阶段交付

### 阶段 1：`.insp` 与 WebGL 基础（已完成）

- 建立插件、manifest、probe 和注册；
- 完成 X3 `.insp` 识别；
- 完成图片解码、双纹理与全景观察；
- 完成 UI、Abort、dispose 和 GPU 生命周期；
- 加入合成图片测试和真实 `.insp` smoke。

完成结果：可以在项目中打开 X3 `.insp` 并浏览完整球面。

### 阶段 2：`.lrv`（已完成）

- 实现定点 `moov` 读取；
- 完成 `.lrv` track/layout probe；
- 增加单视频纹理和自定义媒体控制；
- 验证主音频、seek、结束、重播和清理。

完成结果：可以流畅查看带音频的低分辨率 360° 视频。

### 阶段 3：多文件工作区与 `.insv`（已完成）

- 为多选文件构造内存 `WorkspaceReader`；
- 实现严格的 `_00/_10` 配对；
- 完成双视频时钟、音频、同步和错误状态；
- 验证长时间播放、快速 seek 和资源清理。

完成结果：可以同时选择两段 `.insv` 或打开所在文件夹，并以高清全景方式播放。严格按 `VID_YYYYMMDD_HHMMSS_00|10_编号.insv` 配对；`_00` 为唯一有声主时钟，`_10` 静音。播放有效时长取较短文件，seek 同步写入两路，小漂移以 `0.97/1.03` 短时速率修正，超过 180 ms 时硬对齐。

真实样本验收（2026-09-02）：Google Chrome 152.0.7977.65 / macOS 15.6.1，使用两段 2880×2880、约 30.7 秒的 X3 `.insv`。已验证首帧、连续播放、`_00` 有声主路与 `_10` 静音、前后及连续快速 seek、较短文件结束、重播、文件替换清理和单文件缺配对提示；浏览器控制台无运行错误。

### 阶段 4：Insta360 `.dng`

- 提取最小共享 RAW decoder；
- 实现 X3 DNG 专用 probe；
- 完成 LibRaw 显影、TB 分割和全景渲染；
- 保持其他 DNG 由 camera-raw 插件处理。

完成结果：可以直接打开单个 X3 DNG，不再依赖外部预转 JPEG。

### 阶段 5：gyro、校准与多型号

- 逆向并验证 trailer 中实际需要的元数据字段；
- 增加水平校正和陀螺仪时间轴；
- 评估 FlowState；
- 建立型号级 calibration profile；
- 使用新型号真实样本逐项扩展 manifest 能力和支持矩阵。

## 14. 首期验收标准

- `.insp`、`.lrv`、成对 `.insv` 和 X3 `.dng` 进入正确查看器；
- 其他厂商 DNG 不被 Insta360 插件误接管；
- 不同录像的 `.insv` 不会被错误配对；
- 视频有实际可听主音频，并支持连续播放、seek、结束和重播；
- 双 `.insv` 在完整样本播放期间没有持续可见的半球错位；
- 损坏、截断、伪装、缺少配对和环境能力不足返回准确错误；
- 打开、取消、切换和重复 dispose 后无声音、Object URL、媒体解码、动画帧或 GPU 资源残留；
- 窄窗口、矮窗口、resize 和高 DPR 可用；
- 文件内容、文件名、路径、图像、帧、音频和元数据不发送到外部服务；
- `pnpm test`、`pnpm lint`、`pnpm build` 和首包体积门禁全部通过。

## 15. 明确延后

以下能力不进入首期，避免把查看功能演化成隐式编辑或转码工具：

- HDR 曝光括号自动识别与合成；
- 导出等距柱状 JPEG/MP4；
- 重新编码或 faststart 转换；
- 全量专有 trailer 编辑或写回；
- 对所有 Insta360 相机型号作无证据兼容承诺；
- VR 头显 WebXR 模式；
- 立体 3D、空间视频和其他 VR 容器。

这些能力如有明确需求，应在 `docs/immersive-media/` 下分别建立专项方案和支持矩阵。
