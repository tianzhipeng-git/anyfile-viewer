# 图片查看能力：文档入口与待办

- 状态：阶段 0、阶段 1 已完成验收
- 范围：浏览器本地打开的图片及图像型领域文件
- 最近评审：2026-08-28

## 1. 目标表述

项目不把“支持所有图片格式”定义为对所有已知文件进行完整、像素级一致的还原。这个目标无法验证，也会受到私有格式、设备资源、浏览器能力和第三方解码器的限制。

当前目标是：

> 逐步覆盖已知且有实际价值的图像格式；为每种格式明确支持等级、功能边界、资源策略和已知缺失；保持新增格式不会扩大网站首包，也不会迫使无关插件加载重型依赖。

运行环境以主流浏览器的较新版本为准。

项目统一使用查看器协议中的 0–5 级支持等级。等级由候选插件针对当前具体文件动态 probe 得出，不是写在 Manifest 中的格式常量。图片领域的具体解释和目标见 [support-matrix.md](support-matrix.md)。

## 2. 已接受的架构决策

- 不建立覆盖所有图片格式的万能 `ImageAsset` 或万能 `PixelBuffer`。
- 不创建一个包含所有 decoder 和 renderer 的万能图片插件。
- 宿主先按文件名和扩展名筛选候选，再执行候选插件的可选 probe；probe 针对当前文件动态返回支持等级，宿主按等级降序选择默认插件。
- 不带 probe 的插件以默认支持等级 1 参与排序；同等级保持显式注册顺序。
- Probe 只参与候选排序，完整插件的 `open()` 仍需严格校验文件。
- 共享层只负责真正跨格式的视口、缩放、渲染调度、资源生命周期和通用 UI。
- 普通浏览器原生图片优先使用 `<img>`；只有自定义解码、像素检查、tile、数值映射或离屏合成需要时才使用 Canvas/WebGL。
- 重型 decoder、Worker、WASM 和领域 renderer 必须随具体插件动态加载。
- 色彩处理不是固定的单一流水线；不同内容模型采用不同的语义变换。
- 新的公共抽象必须由真实插件需求反推，不为未来格式预建接口。

完整说明见 [architecture.md](architecture.md)。

## 3. 文档地图

| 文档 | 用途 |
|---|---|
| [概念.md](概念.md) | 统一文件格式、codec、像素格式、内容模型等术语 |
| [architecture.md](architecture.md) | 定义插件边界、内部处理结构、共享层和安全边界 |
| [format-inventory.md](format-inventory.md) | 按内容模型和产品归属整理候选格式 |
| [support-matrix.md](support-matrix.md) | 记录格式支持等级、验收维度与实现状态 |
| [roadmap.md](roadmap.md) | 规定分阶段实施顺序、完成标准和停止条件 |

项目级约束仍以以下文档为准：

- [../viewer-plugin-protocol.md](../viewer-plugin-protocol.md)
- [../viewer-render-tips.md](../viewer-render-tips.md)
- [../viewer-loading-and-deployment.md](../viewer-loading-and-deployment.md)
- [../viewer-ui-and-rendering-proposal.md](../viewer-ui-and-rendering-proposal.md)

其中 `viewer-ui-and-rendering-proposal.md` 仍是提案，不代表其中所有技术选型已经落地。当前 `viewer-ui` 继续以仓库实际实现和插件协议为准，不默认引入 Lit。

## 4. 实现前待办

- [x] 为第一阶段格式收集可再分发的正常、损坏和截断样例；极端尺寸由合成头测试覆盖，不提交超大二进制。
- [x] 填写支持矩阵中的首批基线数据。
- [x] 明确阶段 1 原生 `<img>` 不设置缺少依据的应用层硬上限，只做有界头部读取；具体解码容量由浏览器和设备决定。
- [x] 对浏览器原生路径验证动画、EXIF orientation、ICC、alpha 和取消职责；orientation/ICC 由浏览器应用，插件不重复变换。
- [x] 为首批图片候选实现轻量 probe，并复用项目动态等级稳定排序测试。
- [x] 验证 probe 与完整插件为独立动态入口，probe 可取消且不导入完整 UI。
- [x] 通过第一款真实插件实现最小图片查看 UI，未建立通用 decoder 协议。
- [ ] 通过至少两个 Canvas 类调用方后，再决定是否提取 `viewer-rendering` 公共包。
- [ ] 每引入一个第三方 decoder，记录版本、许可证、维护状态、WASM/Worker 资产和包体积。

## 5. 暂不决策

以下问题要通过试点获得数据后再决定：

- 是否引入 `d3-zoom`，还是先使用少量原生输入处理；
- `viewer-rendering` 是一个 workspace 包还是多个 export path；
- TIFF、GeoTIFF 是拆成两个 probe 竞争的插件，还是共享同一插件实现；
- SVG 使用何种隔离和外部资源策略；
- RAW 首期只展示内嵌预览，还是同时提供完整显影；
- 浏览器不支持某种原生格式时，是否为该格式携带 WASM 回退。

这些问题不得在没有样例、依赖评估和 bundle 数据时仅凭架构偏好决定。
