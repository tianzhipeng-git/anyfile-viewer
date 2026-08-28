# HEIC / HEIF 跨浏览器支持方案

- 状态：已实施（2026-08-29）；浏览器/真实设备扩展语料仍按本文矩阵持续回归
- 日期：2026-08-29
- 范围：浏览器本地查看 HEVC 编码的 HEIF/HEIC 主图像
- 不包含：编辑、转换、写回、服务端转码、完整序列或全部辅助图像导航

## 1. 结论

保留现有浏览器原生解码优先路径，并在 `modern-raster` 插件内增加独立 Worker + WASM 回退。回退实现采用项目自行构建、锁定且可审计的最小 `libheif + libde265` 解码产物，不直接采用当前现成 npm 预编译包。

首期交付目标是：在目标桌面浏览器没有原生 HEIC 能力时，仍可本地解码并查看 HEVC 编码 HEIF/HEIC 的 primary image。能力维持动态支持等级 3，不因为加入 WASM 就提升为等级 4。

实施前有两个硬门禁：

1. 依赖必须至少包含 `libheif v1.23.2` 的安全修复，并建立持续安全升级流程；
2. 完成 libheif/libde265 的 LGPL 分发材料与可重新构建安排。

任一门禁未通过时，继续维持当前原生能力路径，不分发 WASM decoder。

项目方已于 2026-08-29 评审 HEVC 许可材料并确认当前分发风险可接受；该决策需要保留在第三方声明中，但不再作为本方案的待定门禁。

## 2. 当前基线与真实缺口

现有 `modern-raster` 已完成：

- 通过 `ftyp` brand 区分 HEVC HEIF 与 AVIF；
- 对 `.heic`、`.heif`、`.heifs`、`.hif` 注册候选；
- 使用实际 HEIC 样例检查原生 `ImageDecoder` / `<img>` 能力；
- 原生能力存在时显示 primary image，动态等级为 3；
- 原生能力不存在时 probe 返回 0，不向用户提供该插件。

因此当前不是“完全不支持 HEIC”，而是“不具备跨浏览器回退”。本方案只解决这个缺口，不同时扩张到整个 HEIF 容器家族。

需要保持以下格式边界：

- HEIF 是容器家族，不等于 HEVC；
- HEIC 通常表示 HEVC 编码的 HEIF，但扩展名本身不能证明 codec；
- `avif` / `avis` brand 继续交给 `browser-image`；
- VVC、AVC、JPEG、JPEG 2000、未压缩等其他 HEIF codec 首期返回不支持；
- Sony `.hif` 等真实设备变体只有进入回归语料后才声明支持。

## 3. 方案选择

| 方案 | 结论 | 原因 |
|---|---|---|
| 仅保留原生解码 | 不满足目标 | 仍取决于浏览器和操作系统 codec，无法形成跨浏览器能力 |
| 直接使用 `libheif-js@1.19.8` | 拒绝 | 其内含的 libheif 版本落后于 2026 年多项高危/严重安全修复，且包体积和浏览器打包边界不理想 |
| 直接使用 `@discourse/heic@1.0.0` | 拒绝当前版本 | 构建脚本锁定 `libheif v1.19.7`，同样不满足当前安全基线；发布包的 Apache-2.0 元数据也不足以替代内含 LGPL 组件的合规处理 |
| 项目自建最小 WASM | 推荐，需门禁 | 能锁定安全版本、关闭无关 codec/encoder、控制 Worker API、部署方式和第三方声明 |
| 服务端或第三方转码 | 拒绝 | 违反本项目浏览器本地处理、不上传用户文件的边界 |

采用自建产物不是要维护 libheif fork。优先使用上游公开构建入口和未修改源码；项目只维护版本锁定、构建参数、窄适配层、校验和与许可证材料。

## 4. 目标能力与支持等级

### 首期必须支持

- HEVC Main / Main Still Picture 的常见 8-bit 和 10-bit iPhone/Android HEIC；
- primary item；
- libheif 能正确合成的 grid/derived primary image；
- primary image 关联 alpha；
- 容器声明的 crop、rotate、mirror 等显示变换；
- 解码为明确契约的 RGBA8 显示缓冲；
- fit、actual size、缩放、平移和用户旋转继续复用现有视口。

### 首期明确缺失

- image sequence 播放和帧导航；
- 非 primary 顶层图片、burst、多视角图片选择；
- depth、disparity、gain map 等辅助图像查看；
- 保留 10/12-bit 输出、HDR 显示和 display-aware tone mapping；
- 任意 ICC profile 的完整颜色转换保证；
- HEVC 以外 codec 的通用 HEIF 解码。

因为这些缺失对 HEIF 语义有实际影响，成功解码仍返回等级 3。若后续要提升到等级 4，必须另行定义“声明范围内完整”的子集，并补齐多图/序列、颜色与真实语料证据。

## 5. 运行时架构

```text
扩展名候选
    ↓
轻量 probe：有界读取 ISO BMFF 结构，识别实际 codec
    ├── AV1 → browser-image
    ├── HEVC → modern-raster，等级 3
    └── 其他/损坏 → 0
                    ↓
              modern-raster.open()
                    ↓
        原生 HEIC 实际解码成功？
          ├── 是 → 原生 ImageBitmap 路径
          └── 否 → 动态加载 HEIF Worker
                         ↓
              Worker 内加载同源 WASM
                         ↓
          primary image → RGBA8 transferable
                         ↓
         ImageBitmap → 现有 Canvas viewport
```

关键实现约束：

- manifest 保持纯数据；
- probe 不导入 Worker、WASM 或完整 libheif parser；
- WASM 只在打开已识别的 HEVC HEIF 且原生实际解码失败后加载；
- HEIF 使用独立 Worker，不把 HEIF 状态塞进现有 JXL Worker；
- Worker 接收 `File`，在 Worker 内按已验证的输入上限读取，避免主线程创建完整副本；
- Worker 返回 transferable RGBA 缓冲及 width、height、alpha、颜色/变换说明；
- 主线程只负责构造 `ImageBitmap` 并交给现有 `ModernBitmapViewport`；
- abort 和 dispose 直接终止 Worker，释放 WASM heap、RGBA、ImageBitmap、定时器和 DOM；
- 不增加协议字段，也不修改公共图片中间表示。

## 6. Probe 与容器识别

现有只检查 HEVC compatible brand 的实现应升级为小型、严格、有界的 ISO BMFF probe，但不能演变成第二个完整 HEIF parser。

Probe 至少需要：

- 校验 box size、extended size、偏移加法和嵌套深度；
- 读取 `ftyp` major/compatible brands；
- 在限定字节与 box 数量内检查 `meta` 下的 item/property 结构；
- 区分 `av01`、`hvc1`、`hev1` 及未知 item codec；
- 拒绝截断、越界、递归/数量超限和明显伪装文件；
- 对无法在 probe 预算内确认的 `.heic/.heif` 返回 0，而不是仅凭扩展名猜测。

Probe 仍只负责路由。完整 Worker 必须重新解析并校验整个文件；默认打开失败后不自动切到其他插件。

## 7. Decoder 产物与部署

本依赖遵守项目通用的 [源码构建型第三方依赖规范](../viewer-source-built-dependencies.md)，使用可重复构建配方、提交审核产物、部署时生成静态资源的三层结构：

```text
tools/heif-wasm-build/                        构建配方、adapter 与验证
        ↓
third_party/heif-wasm/<artifact-version>/     提交 Git 的审核产物
        ↓ prepare
public/vendor/libheif/<artifact-version>/     不提交的部署资源
```

审核产物和部署目录中的分发文件至少包括：

```text
├── heif-decoder.js
├── heif-decoder.wasm
├── LICENSE.libheif
├── LICENSE.libde265
├── THIRD_PARTY_NOTICES.md
└── build-info.json
```

构建要求：

- 锁定 `libheif`、`libde265`、Emscripten 和构建容器版本；
- 校验上游源码归档 SHA-256；
- 只启用 decode、HEVC 和必要色彩转换，关闭 encoder、CLI、动态插件及无关 codec；
- 关闭运行时第三方网络加载；
- 默认保留 libheif security limits，并由 adapter 进一步收紧；
- 禁止 unsafe-eval 构建；
- 记录完整构建参数、上游 commit/tag、产物哈希和许可证；
- 普通应用构建不编译 libheif；只从 `third_party` 的精确产物版本校验并复制到 `public/vendor`；
- 不由插件在运行时下载构建资产；
- CSP/部署验证允许同源 Worker 和 WebAssembly，不新增 CDN 来源。

不建议把 WASM base64 内联进 JavaScript。独立 `.wasm` 更利于缓存、体积审计、安全替换，也更容易满足 LGPL 下替换/重新链接的合规设计；最终合规方式仍由法律评审确认。

## 8. 像素、颜色与方向契约

WASM adapter 的输出契约固定为：

```text
width / height: 已应用容器显示变换后的尺寸
layout: RGBA8
alpha: straight / non-premultiplied
transfer: ArrayBuffer 所有权转移给主线程
orientation: libheif 已应用，viewport 初始不再重复应用
color: 明确记录为 sRGB、NCLX 转换结果或 unknown
ICC: 只有真实应用后才能标记 applied
HDR: 首期降为 SDR 预览并明确提示，不能宣称 HDR 正确显示
```

Spike 必须用带 orientation、alpha、NCLX、ICC、10-bit 和 gain map 的样例验证 libheif 实际行为。若任一行为无法从 API 和像素结果确认，UI 显示能力缺失并维持等级 3，不能用假定填补。

## 9. 资源与安全边界

最终阈值必须由目标设备实测确定，不能只复制其他 decoder 的数字。实施 spike 可以把现有现代栅格的 256 MiB 输入和 64 Mi 像素作为绝对上界，但发布值需要根据以下峰值模型收紧：

```text
编码文件副本
+ WASM 容器/codec 状态与中间 YUV planes
+ RGBA8（width × height × 4）
+ transferable / ImageBitmap / Canvas 的短时副本
```

发布前必须明确并测试：

- 输入字节、宽高、总像素、item、tile、derived-image 深度和 metadata 上限；
- 所有乘法和偏移在分配前检查安全整数与溢出；
- 每次只解码一个 primary image，不预解码全部 item；
- 同一插件实例最多一个活跃 HEIF 解码任务；
- 资源超限返回 `resource-limit`；
- 结构损坏、codec 不符或解码失败返回 `invalid-file`；
- WASM/Worker 无法初始化才返回 `unsupported-environment` 或 `open-failed`；
- 对上游安全公告建立依赖阻断规则，不允许已知 critical/high 漏洞版本进入构建。

WASM 和 Worker 能减少主线程影响，但不是可信文件沙箱；安全版本、边界检查和快速终止仍是必要条件。

## 10. 合规门禁

`libheif` 和 `libde265` 上游均声明 LGPL-3.0；项目需要保留通知、许可证、对应源码/修改和允许替换链接库的分发安排。npm 包自身显示为 Apache-2.0 或其他宽松许可证，不能覆盖其内嵌二进制的许可证义务。

HEVC 还存在独立于开源许可证的标准必要专利问题。Access Advance 的公开材料明确把软件和云端可用的 HEVC decoder 纳入其许可讨论范围。项目方已于 2026-08-29 评审该材料并确认当前分发风险可接受；该结论不改变 LGPL 工程义务，也不能被泛化为其他 codec 或分发模式的默认结论。

合规验收输出至少包括：

- 第三方组件、版本、源码地址、许可证和修改清单；
- 可获取的对应源码与可复现构建说明；
- WASM 替换/重新链接方式；
- 已确认的 HEVC 风险决策及其适用分发范围；
- 不通过时关闭 WASM 回退、保留原生路径的产品开关策略。

## 11. 实施拆分

### 阶段 A：依赖与像素 spike

- 用 `libheif >= 1.23.2` + 锁定 `libde265` 构建最小 WASM；
- 在独立 Worker 解码当前 `sample.heic` 和真实手机样例；
- 记录 raw/gzip 体积、初始化时间、12MP/48MP 峰值内存与耗时；
- 验证 alpha、orientation、10-bit、grid、NCLX/ICC 和取消；
- 完成 LGPL 分发材料，并把已确认的 HEVC 风险决策写入第三方声明。

完成标准：没有已知 critical/high 安全缺口；像素行为和资源模型可解释；LGPL 分发材料和可重新构建安排完整。否则停止。

### 阶段 B：插件接入

- 增强轻量 HEIF probe；
- 新增 HEIF Worker client、消息类型和 decoder adapter；
- 改为“原生实际解码 → WASM 回退”；
- 将 RGBA 结果接入现有 viewport；
- 增加准确的路径、颜色和能力缺失文案；
- 保持 JXL 路径行为不变。

完成标准：强制关闭原生 HEIC 时，WASM 路径可打开声明范围样例；abort/dispose/错误码和 DOM 所有权通过协议测试。

### 阶段 C：部署与验收

- 增加版本化同源资产准备和完整性检查；
- 扩展首包门禁，确保 HEIF JS/WASM 不进入 `/view` 初始包、probe 或 JXL chunk；
- 完成 Chromium、Firefox、Safari 的原生路径和强制 fallback 测试；
- 更新 catalog、README、roadmap、加载部署文档和支持矩阵；
- 记录实际资产体积、浏览器矩阵、资源阈值和已知缺失。

完成标准：`npm test`、`npm run lint`、`npm run build` 通过，真实浏览器与真实设备语料验收完成，合规材料随分发产物可获取。

## 12. 测试矩阵

至少准备具有明确再分发依据的以下固定样例：

- `heic` / `heix` / `hevc` / `hevx` brand；
- 8-bit、10-bit、alpha、orientation、grid primary；
- NCLX、ICC、gain map（用于确认降级文案）；
- 多顶层图片和 sequence（用于确认首期只显示 primary）；
- `.heif` 中 AV1（必须由 browser-image 获胜）；
- HEVC 以外 codec 的 HEIF（必须拒绝）；
- 空文件、伪装扩展名、截断 box、非法长度、极端尺寸、item/derived chain 超限；
- 上游公开安全回归样例中许可允许纳入的边界结构。

验证层次：

1. 纯函数：BMFF box/codec 识别、溢出和上限；
2. Worker：真实 WASM 像素尺寸、alpha、方向、颜色说明和错误映射；
3. 插件：native/fallback 分支、opening/active abort、重复 dispose、资源释放；
4. 构建：首包、probe chunk、Worker/WASM 资产、响应头和 CSP；
5. 浏览器：窄/矮窗口、高 DPR、连续切换、12MP/48MP 文件和低内存失败行为。

像素验证使用受信任桌面 `heif-dec` 输出或原始测试图作为参考，并为色彩转换设置有依据的容差；不能只断言“得到了一张非空图片”。

## 13. 主要风险与停止条件

- 无法满足 LGPL 分发或可重新构建要求；
- 最新安全版无法稳定构建为符合 CSP 的 WASM；
- 真实手机样例存在不可解释的方向、alpha 或严重色差；
- 12MP 常见照片峰值内存不可控，或取消不能及时终止；
- WASM/胶水代码进入首包、probe 或无关插件；
- 只能依赖运行时 CDN 或上传用户文件。

发生任一项时，不叠加 workaround。停止 WASM 发布，保留当前原生路径并在支持矩阵中记录阻塞原因。

## 14. 上游依据

- [libheif：功能、Emscripten 构建与 security limits](https://github.com/strukturag/libheif)
- [libheif v1.23.2 security release](https://github.com/strukturag/libheif/releases/tag/v1.23.2)
- [libheif 官方 Emscripten 构建脚本](https://github.com/strukturag/libheif/blob/master/build-emscripten.sh)
- [libde265：HEVC decoder 与 LGPL-3.0](https://github.com/strukturag/libde265)
- [libheif-js 1.19.8 包信息](https://www.npmjs.com/package/libheif-js)
- [jSquash HEIC 构建锁定 libheif v1.19.7](https://github.com/discourse/jSquash/blob/main/packages/heic/codec/Makefile)
- [Access Advance HEVC Program Overview](https://accessadvance.com/wp-content/uploads/2021/06/HEVC-Advance-Program-Overview-July-2025.pdf)

## 15. 实施记录

- 审核产物：`libheif 1.23.2 + libde265 1.1.1`，产物版本 `1.23.2-anyfile.1`；源码、commit、归档 SHA-256、Emscripten 镜像 digest、功能开关和产物哈希记录在 `third_party/heif-wasm/1.23.2-anyfile.1/build-info.json`。
- 分发材料：两份 LGPL 正文、第三方声明、对应源码/替换说明随部署资产公开；HEVC 风险决定限定在本地浏览器 decoder 分发范围。
- 加载边界：probe 只做前 1 MiB 内的有界 BMFF/item/derived 引用检查；原生实际解码失败后才创建独立 HEIF Worker，Worker 再完整解析文件并动态加载同源 WASM。
- 输出契约：应用容器变换后的 RGBA8、straight alpha、transferable `ArrayBuffer`；NCLX/无 profile 转 sRGB，ICC 明示未应用，>8-bit 明示 SDR 预览。
- 发布阈值：HEIF 原生路径沿用 256 MiB 通用输入上限，WASM 回退输入 128 MiB、输出 64 Mi 像素、256 items、4096 tiles、384 MiB libheif 总内存预算；Worker 终止负责取消和资源回收。
- 自动验收：probe 的真实样例/损坏结构、fallback 生命周期与 DOM 所有权测试；本地浏览器 smoke 在 Worker 中把固定 HEIC 解码为 96×64、24,576 字节 RGBA。
- 产物体积：JavaScript 33,783 字节；WASM 1,166,264 字节。普通 `npm` 构建只校验并复制审核产物，不编译 native 依赖。
