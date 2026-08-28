# 图片查看架构

- 状态：第一轮评审结论
- 适用范围：新增图片及图像型领域查看器
- 不包含：编辑、转换、写回、服务端处理

## 1. 设计目标

图片查看架构需要同时满足：

- 简单格式保持简单，普通 JPEG/PNG 不为专业格式承担依赖成本；
- 重型 decoder、Worker、WASM 和 renderer 只在对应插件打开后加载；
- 大文件可以分片、按页、按帧、按 tile 或按切片处理；
- 每种格式可以保留自己的内容语义和交互；
- 跨插件重复的视口、输入、调度和资源清理可以逐步复用；
- 文件始终在浏览器本地处理，并服从现有插件协议的 Abort、dispose 和 DOM 所有权规则。

## 2. 与现有插件协议的关系

图片插件使用项目统一的两阶段路由：

1. 宿主按文件名和扩展名筛选候选插件；
2. 候选注册项可以动态加载轻量 `probe()`；
3. 每个 probe 针对当前 `File` 返回 0–5 的动态支持等级；
4. 没有 probe 的候选等级默认为 1；
5. 宿主按等级降序排列，同等级保持显式注册顺序；
6. 宿主只动态加载默认或用户选中的完整插件并调用 `open(context)`；
7. 切换时执行 abort、dispose 和容器清理。

Probe 可以读取必要的 magic bytes、容器结构、内部 codec 或子类型信息，但只负责排序。`open()` 仍要进行严格校验、资源限制检查和真正渲染。默认插件打开失败时展示错误，不自动尝试下一项。

同一扩展名可以由多个插件竞争。例如 `.tif` 的 GeoTIFF 插件可以对带地理语义的文件返回 5，通用 TIFF 插件返回 4；对于普通 TIFF，GeoTIFF probe 返回 0，通用 TIFF 插件返回 4。是否共享底层 parser 由实际依赖和重复决定，不影响路由模型。

第一阶段有意只按文件名和扩展名产生候选。无扩展名或错误扩展名的全局格式识别不属于当前范围。

## 3. 总体结构

```text
File / WorkspaceReader
          │
          ▼
有界读取、格式校验、容器解析
          │
          ▼
格式专属内容模型
          ├── 单帧栅格
          ├── 帧序列 / 多页
          ├── tile / 金字塔
          ├── 相机 RAW
          ├── 图层文档
          ├── 矢量场景
          ├── 科学 / 医学体数据
          └── GPU 纹理集
          │
          ▼
按需解码或领域变换
          │
          ▼
格式专属 renderer adapter
          │
          ▼
插件 UI + 可复用查看基础能力
```

它不是所有文件都必须经过的固定流水线。某些分支会绕过其中的步骤：

- 浏览器原生图片可以从 `File` 直接创建 Object URL 交给 `<img>`；
- SVG 可以直接由受限制的浏览器图片上下文栅格化，不暴露通用 Pixel Buffer；
- KTX2 可以转码到 GPU 支持的纹理格式后直接上传，不必生成 RGBA；
- GeoTIFF 可以只读取当前视口所需的 overview 和 tile；
- NIfTI 可以把标量体数据上传为纹理，再由 shader 完成切片和数值映射。

## 4. 插件族边界

初始边界用于控制依赖和领域复杂度，不是永久 API：

| 建议插件族 | 典型格式 | 主要实现路径 |
|---|---|---|
| browser image | JPEG、PNG、GIF/APNG、WebP、AVIF | `<img>` 和浏览器原生解码 |
| safe vector image | SVG、SVGZ | 主动内容隔离后的浏览器渲染 |
| general raster | TIFF、TGA、PNM、PCX、ICO/ICNS | JS/WASM decoder + Canvas |
| camera RAW | DNG、CR2/CR3、NEF、ARW、RAF | 内嵌预览或 RAW pipeline |
| layered document | PSD/PSB、ORA、KRA、XCF | 合成预览、图层模型和增量合成 |
| GPU texture | DDS、KTX/KTX2、Basis | 转码、mip/face 选择和 GPU renderer |
| geospatial raster | GeoTIFF、COG、遥感栅格 | window/tile 读取和地理元数据 |
| medical image | DICOM | image loader、序列和医学视口 |
| volume/scientific image | NIfTI、NRRD、FITS 等 | 标量数据、切片、colormap/体渲染 |

拆分插件不意味着复制所有 UI。共享能力在有真实重复后下沉到公共包。

## 5. 内容模型而不是万能中间表示

第一阶段不定义公开的 `ImageDocument` 联合类型。以下名称只作为需求词汇：

- `RasterSource`：提供一张可绘制栅格；
- `FrameSequence`：提供帧、时长、循环和帧处置；
- `PageSource`：按页读取多页图片；
- `TilePyramid`：按 level、region 或 tile 获取数据；
- `LayeredDocument`：图层树、蒙版、混合和合成结果；
- `VolumeDataset`：维度、spacing、orientation 和标量数据；
- `TextureSet`：mip、face、layer 和 GPU 压缩格式。

只有两个以上插件出现结构相同、生命周期相同的调用方式时，才评估把其中一项变成共享接口。格式内部类型不进入 `viewer-protocol`。

## 6. 解码后数据契约

自定义 decoder 若输出像素，至少要在插件内部明确：

- width、height；
- channel layout 和 bit depth；
- typed array / ImageData / ImageBitmap 的所有权；
- alpha 是否存在、是否预乘；
- 色彩空间或“未知”；
- ICC 是否已应用；
- orientation 是否已应用；
- 帧、页、tile 或区域位置；
- 释放方法和可转移性。

这是一份实现检查清单，不要求所有 decoder 实现同一个类。未知色彩信息不能默认伪装成已正确转换的 sRGB。

## 7. Renderer 选择

### 浏览器原生元素

普通原生图片首先选择 `<img>`：

- 保留浏览器动画和颜色处理路径；
- 不必在 JavaScript 中分配完整 RGBA 副本；
- 使用 CSS transform 即可实现基础缩放、平移和旋转。

不要仅为了“统一渲染器”把所有原生图片先画到 Canvas。

### Canvas 2D

适合自定义解码后的普通栅格、像素检查、简单合成和中等尺寸图片。必须处理 DPR、ResizeObserver、重绘调度和资源释放。

### WebGL / WebGPU

只在体数据、GPU texture、大量 tile、shader 数值映射或 Canvas 2D 明确无法满足性能需求时引入。领域 renderer 优先于自建通用 GPU 引擎。

### DOM / SVG

适合需要可访问文本或图元语义的内容，但不允许把不可信 SVG/HTML 直接注入宿主 DOM。SVG 的脚本、事件属性、外部资源和链接策略必须单独评审。

## 8. 共享基础能力

候选共享能力包括：

- 图片工具栏和元数据区；
- zoom、pan、rotation 和 fit 模式；
- CSS 尺寸、物理像素和 DPR 同步；
- `requestAnimationFrame` 调度；
- ResizeObserver / IntersectionObserver 生命周期；
- Object URL、ImageBitmap、Worker、Canvas、纹理和第三方实例清理；
- 页、帧、图层、mip 和切片选择控件；
- loading、empty、partial error 和 unsupported capability 状态。

当前 `@anyfile/viewer-ui` 是原生 DOM、零运行时依赖的实现。Lit 是否适合未来复杂组件需要单独评估，不是图片查看器的前置条件。

`viewer-rendering` 当前仍是提案。第一款图片插件可以在插件内部保留最小实现；出现第二个真实 Canvas 调用方并确认重复后，再提取公共代码。

## 9. 色彩和领域变换

不存在适合所有内容的统一“Color Management”步骤：

```text
普通图片：encoded image → browser decode/color pipeline → display

RAW：mosaic samples → demosaic → white balance
    → camera/profile transform → tone mapping → display

科学/医学：scalar values → window/level
          → colormap → display

HDR：high-range color → profile/transfer handling
   → display-aware tone mapping → display
```

每个插件必须记录浏览器、decoder 和 renderer 分别负责哪些变换，尤其避免 orientation、ICC、alpha premultiplication 和 tone mapping 被应用两次。

## 10. 大文件与安全边界

每个插件在完整解码前尽可能读取并校验文件头。至少设置：

- 输入文件大小上限；
- width、height、depth 和总样本数上限；
- 解码后内存预算；
- 帧、页、图层、tile、mip 和元数据项数量上限；
- 单个元数据块和字符串长度上限；
- 容器嵌套、目录或 chunk 数量上限；
- Worker 并发和缓存上限。

所有乘法在分配前检查溢出。压缩文件大小很小不代表解码安全。达到限制时返回 `resource-limit`，损坏或伪装格式返回 `invalid-file`。

插件还必须：

- 在每个异步边界响应 `AbortSignal`；
- 在失败、取消和 dispose 时走同一套幂等清理；
- 不执行脚本、宏或文件携带的主动内容；
- 不向外部服务发送文件、文件名、路径或解析结果；
- 不让第三方 renderer 修改插件根节点以外的 DOM。

## 11. 动态加载边界

- manifest 只包含纯数据和类型；
- probe 是可选的独立动态入口，只读取足够计算当前文件支持等级的内容；
- 完整插件实现通过注册表中的另一个 `import()` 动态加载；
- 不带 probe 的候选不产生 probe 请求，并以默认等级 1 参与排序；
- probe 不得静态导入完整插件、renderer 或不参与判断的重型依赖；
- decoder adapter 可以在插件内部继续按格式或能力动态加载；
- Worker/WASM/字典/profile 等资产使用锁定版本并随项目构建；
- 不从公共 barrel 静态 re-export 重型 adapter；
- 新依赖必须经过生产构建和 `/view` 首包检查。

是否允许特定公共引擎资产使用 CDN，必须逐项评审本地回退、CSP、隐私和版本锁定，不能从现有 DuckDB 特例自动推广到图片 decoder。

## 12. 参考实现候选，不是既定依赖

- 浏览器常见格式：[MDN 图片格式指南](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)
- 浏览器 codec 接口：[WebCodecs](https://www.w3.org/TR/webcodecs/)
- GeoTIFF：[geotiff.js](https://geotiffjs.github.io/)
- 医学影像：[Cornerstone3D](https://www.cornerstonejs.org/docs/getting-started/overview/)
- 医学体数据：[NiiVue](https://github.com/niivue/niivue)
- 科学/医学 IO：[ITK-Wasm](https://docs.itk.org/projects/wasm/en/latest/)
- GPU texture：[KTX-Software](https://github.com/KhronosGroup/KTX-Software)

采用任何候选项之前都要验证许可证、维护状态、浏览器兼容性、包体积、Worker/WASM 部署和 dispose 能力。
