# 电子书查看架构

- 状态：EPUB 2/3 reflowable、CBZ 与 FB2 已交付；EPUB/FB2 共用最小章节阅读层
- 适用范围：EPUB、FB2、MOBI/Kindle、漫画归档、DjVu、CHM 等本地只读阅读
- 相关文档：[格式清单](format-inventory.md)、[支持矩阵](support-matrix.md)、[实施路线图](roadmap.md)

## 1. 目标与原则

电子书查看需要同时满足：

- 文件在浏览器中直接读取、解析和显示，不上传到服务器；
- 优先覆盖更多有真实阅读价值的格式，不建设编辑器或完整书库应用；
- 首屏不等待整本书解压、排版、图片解码或全文索引完成；
- 大型 parser、Worker、WASM 和压缩 decoder 只在对应插件被选中后加载；
- 书内 HTML、SVG、CSS、字体和链接属于不可信内容，不能进入宿主 DOM 或自动访问网络；
- 压缩包、章节、图片、字体、DOM、Canvas 和缓存都有明确资源上限；
- abort、dispose、DOM 所有权、错误码和支持等级遵守查看器插件协议。

“能列出 EPUB/CBZ 的 ZIP 条目”不是阅读支持；“能提取 MOBI 文本”也不等于保留了章节、图片和阅读顺序。支持等级必须反映用户能否连续理解主要内容。

## 2. 支持单位

电子书不能只按扩展名声明能力，最小支持单位是：

```text
格式族 + 容器/版本 + 内容表示 + 布局 + 压缩/加密 + 必要资源
```

示例：

- EPUB 3 + OCF ZIP + XHTML/SVG + reflowable + 无 DRM；
- EPUB 3 + fixed-layout + 字体与图片内嵌 + 无脚本；
- MOBI PalmDB + MOBI7 HTML + PalmDOC 压缩 + 无 DRM；
- CBZ + ZIP + JPEG/PNG/WebP 页面 + ComicInfo.xml；
- DjVu multipage bundled + raster page + hidden text layer。

同一扩展名内的差异会改变阅读结果，probe 只能有界判断路由，`open()` 必须做完整校验。

## 3. 插件与共享边界

### 3.1 建议插件族

| 插件 | 首要范围 | 不承担 |
|---|---|---|
| `epub-reader` | EPUB 2/3、reflowable、fixed-layout | MOBI 转换、DRM、执行书内脚本 |
| `fictionbook-reader` | `.fb2`、`.fb2.zip` | 任意 XML/ZIP 查看 |
| `comic-book-reader` | CBZ；后续 CBR、CB7、CBT | 通用归档浏览、图片编辑 |
| `mobi-reader` | PalmDOC/MOBI7/KF8/AZW3 无 DRM 子集 | KFX、DRM 解密、云端转换 |
| `djvu-reader` | 单页/多页 DjVu 渲染和可用文本层 | PDF 回退、OCR 生成 |
| `chm-reader` | CHM 目录、索引与 HTML topic | ActiveX、脚本、外部网站嵌入 |

PDF 继续由 `pdfjs-pdf` 负责；TXT、HTML、Markdown 等继续使用现有文本/代码查看器。电子书分类可以统一展示入口，但不能复制 parser 或抢占已有更高等级插件。

### 3.2 两个窄阅读基础设施

不建立包含所有格式可选字段的万能 `EbookDocument`。`@anyfile/rendering-publication` 已由 EPUB、FB2 两个真实插件验证并提取；下图漫画包仍为规划，漫画代码保持插件内部：

```text
@anyfile/rendering-publication
├── chapter viewport：单章节/连续滚动、章节虚拟化
├── navigation：目录、上一章/下一章、当前位置
├── typography：字号、行高、页边距、主题、writing-mode
├── safe content host：隔离文档、资源 URL 生命周期
└── location：格式 adapter 自己提供的稳定定位符

@anyfile/rendering-comic
├── page virtualization：单页、双页、连续滚动
├── direction：LTR / RTL、封面单页、跨页
├── image fitting：适宽、适高、原始尺寸
└── prefetch/cache：有界前后页解码和释放
```

它们不是可注册的 `FileViewerPlugin`，不包含 Manifest、probe、格式 parser、归档解压或持久化书架。DjVu 可复用漫画的页面 viewport，但不应因此把 DjVu decoder 放入漫画包。

### 3.3 格式 adapter 契约

流式出版物当前通过以下内部接口适配（完整定义见 `viewer/rendering-publication/src/types.ts`）：

```ts
interface PublicationSource {
  title: string;
  author: string;
  spine: { id: string; path: string }[];
  toc: { label: string; path: string; fragment: string }[];
  loadSection(path: string, signal: AbortSignal): Promise<SafeChapter>;
}
```

`path` 是 adapter 拥有的不透明章节定位符，不要求是归档路径。EPUB 在闭包里按 entry 读取，FB2 从有界 XML 中取章节结构。`SafeChapter` 只包含已清理的 HTML、内部链接目标、缺失资源计数及幂等 `dispose()`；各格式 adapter 负责主动内容白名单和资源解码，公共层负责无脚本 sandbox、统一 CSP 常量、三章窗口、排版、导航、返回历史与卸载。根 controller 持有格式源并在销毁时释放；不进入 Viewer Protocol，不建立公共归档或 XML parser。

## 4. 数据路径

### 4.1 EPUB

```text
File
  → 有界 ZIP/OCF 校验
  → META-INF/container.xml
  → package document：metadata / manifest / spine
  → EPUB 3 nav 或 EPUB 2 NCX
  → 按当前章节解压 XHTML/SVG/CSS/资源
  → 清理主动内容 + 重写内部 URL
  → sandbox iframe 中排版
```

必须支持相对 URL、fragment、base path、百分号编码和大小写敏感的容器路径。只允许读取容器中已验证的资源；远程 manifest resource、外链图片/字体/媒体默认不加载。EPUB 3.3 的完整 reading-system conformance 不作为首期承诺，具体子集记录在支持矩阵。

### 4.2 FB2

```text
File / FB2 ZIP
  → 有界 XML/ZIP 校验
  → description / body / section / binary
  → 结构化章节 + metadata + base64 图片
  → 生成受控 HTML
  → publication viewport
```

FB2 不是任意 HTML。adapter 应显式映射标题、段落、诗歌、引用、脚注链接和图片，不用 XSLT 执行不可信样式表。大 `<binary>` 内容按当前及相邻章节需要才解码，并限制单资源和累计解码字节。当前原始 XML 最多 32 MiB，使用浏览器 DOMParser 进行有界同步解析；不是流式/Worker XML parser，解析调用本身不能中途终止。异步文件读取与逐章 HTML 映射检查 AbortSignal，映射每 256 节点让出事件循环。完整 XML DOM 在实例内保留，图片字节与 URL 不跨章节缓存，dispose 清空索引与 XML 引用。

### 4.3 MOBI / PalmDOC / AZW3

```text
File
  → Palm Database header / record table 校验
  → Worker 中解析 PalmDOC/MOBI/KF8 records
  → 解压文本、EXTH metadata、目录与资源
  → 规范化为受控章节
  → publication viewport
```

实施前先 spike 纯 TypeScript parser 与 `libmobi` 的裁剪 WASM。`libmobi` 只能作为候选：其 LGPL-3.0、WASM 构建、动态链接/替换要求、体积、取消和畸形文件边界必须经过许可证与技术评审。不得借助服务端 Calibre 或把整本书上传转换。

检测到 DRM 时展示“不支持受保护内容”的稳定状态；不得尝试移除、规避或弱化 DRM。

### 4.4 漫画归档

```text
CBZ/CBR/CB7/CBT File
  → 格式签名 + 有界归档索引
  → 过滤安全的图片 entries / ComicInfo.xml
  → 自然排序 + metadata 覆盖
  → 按当前页解压、解码和预取
  → comic viewport
```

CBZ 首期复用或提取现有 ZIP 读取能力；RAR/7z/TAR 只有在归档 decoder 能随机/有界读取、终止和释放后接入。`libarchive` 的裁剪 WASM 是 spike 候选，不是既定依赖。实体文件名不写入磁盘，路径遍历、软链接和设备节点一律不得物化。

### 4.5 DjVu 与 CHM

DjVu 由专用 decoder 在 Worker 中按页解码为像素或 `ImageBitmap`，主线程仅虚拟化可见 Canvas；隐藏文本层只有在坐标和顺序可验证时启用。DjVu.js 可作为 browser-local spike 候选，但 GPLv2 许可证和分发影响必须先评审。

CHM 需要解析 ITSF/ITSP 目录、LZX 数据块和 contents/index，再把 topic HTML 送入与 EPUB 相同等级的安全内容边界。`ms-its:`、ActiveX、脚本、`javascript:` URL 和远程子资源不执行；跨 CHM 链接只显示为不可用或明确外链。

## 5. 阅读 UI

### 5.1 所有电子书的最低交互

- 目录或页缩略导航；
- 上一章/下一章或上一页/下一页；
- 当前章节/页码和全书粗略进度；
- 键盘可达的工具栏、焦点状态和屏幕阅读器名称；
- resize 后保留语义位置，而不是只保留旧像素滚动值；
- 加载、局部资源失败和不可恢复错误的明确状态。

### 5.2 流式文本

首期默认连续滚动，避免在未验证排版稳定性前承诺精确分页。提供字号、行高、内容宽度和浅/深主题；作者 CSS 与用户可读性设置的优先级必须明确。竖排、RTL、ruby、复杂脚注和 MathML 按固定样例逐项声明。

位置使用格式稳定锚点，例如 spine item + fragment/文本位置；不能只保存页面号，因为 viewport 和字体变化会重新分页。首期位置仅保存在当前插件实例，不新增跨会话阅读记录。

### 5.3 固定页面和漫画

提供适宽、适高、单页、双页和连续滚动。双页模式必须处理封面单页、奇偶页和 RTL；默认不做裁边、颜色增强、OCR 或图像修复。

## 6. 内容安全与隔离

书内内容必须被视为恶意输入：

- 使用仅允许 `allow-same-origin` 的 sandbox iframe，始终不授予脚本、表单、弹窗或顶层导航权限；由父页面受信代码操作清理后的正文 DOM，决策与实测依据见 [阶段 0 决策](phase-0-decisions.md)；
- 移除 `script`、事件属性、`iframe`、`object`、`embed`、表单和自动播放媒体；
- 清理 CSS 中的远程 `url()`、`@import`、危险 SVG 引用和宿主越界定位；
- 内部链接只导航到已解析的 spine/resource；当前外部链接移除 href，不启用导航；
- 禁止自动发出远程图片、字体、音视频、脚本和 iframe 请求；
- 只为当前实例创建最少 Object URL，并在章节卸载或 `dispose()` 时撤销；
- XML parser 禁止外部实体、DTD 网络解析和 XSLT 执行；
- 解压前检查 entry 数、声明大小、累计展开量、嵌套深度和压缩比。

如果采用第三方阅读库，其默认 iframe/sandbox 设置不构成安全证明；接入测试必须验证脚本、网络、导航、表单和跨文档访问均被阻断。

## 7. 性能与资源边界

每个格式至少记录并执行：

- 原文件大小、归档 entry 数、单 entry 和累计展开字节、压缩比；
- spine/章节/页数、目录节点数和最大嵌套深度；
- 单张图片像素、累计解码图片内存、预取页数；
- 字体数量、单字体和累计字体字节；
- 单章节原始/清理后 HTML 字节、DOM 节点数和 CSS 规则数；
- Worker/WASM 内存、主线程复制次数、首屏时间和滚动帧稳定性。

基础策略：

- probe 只读文件头和必要尾部索引，不加载完整 parser；
- 归档索引、XML、PalmDOC/MOBI、LZX 和 DjVu 解码优先放在可终止 Worker；
- 只加载当前章节/页和小范围邻近内容，离屏后释放 DOM、Canvas、ImageBitmap 和 Object URL；
- 大图片先按显示尺寸解码，不能默认保留整书所有原始位图；
- 全文搜索索引不是首期前置条件；若以后增加，必须增量构建且可取消；
- 达到边界返回 `resource-limit`，不能依赖浏览器 OOM。

当前数值、测量口径和执行位置见 [阶段 0 决策](phase-0-decisions.md)。

## 8. 加载、错误与生命周期

- Manifest、probe 和 `/view` 首包不导入 EPUB renderer、归档 decoder、MOBI、DjVu 或 CHM 完整实现；
- EPUB/FB2 的轻量 TypeScript 代码仍按插件延迟加载；MOBI/DjVu/libarchive WASM 再做插件内二次加载；
- 单资源达到 2 MiB 或典型冷启动达到 4 MiB 时，按部署约定设计外部资产链路和同版本回退；
- `open()` 显示首章/首页或插件内部可交互加载状态后即可返回，后台继续建目录或预取；
- 密码、DRM 或资源选择 UI 必须在 active 阶段处理，不能让 `open()` 等待用户；
- 当前章节或页面失败时局部报错，整个 publication 无法继续时才切为插件根错误状态；
- `dispose()` 幂等终止 Worker、解压/解码任务、iframe、observer、事件、Object URL、ImageBitmap 和缓存；
- 文件切换后任何旧任务都不得继续写 DOM 或更新阅读位置。

错误映射：

| 场景 | 错误 |
|---|---|
| 签名、容器、XML、record table 或必需根文件损坏 | `invalid-file` |
| EPUB/CHM 内必需的本地资源缺失 | `missing-related-file` 或 active 局部错误 |
| 浏览器缺少 Worker/WASM/Canvas 等必需能力 | `unsupported-environment` |
| 展开、DOM、图片、页数或内存超过已定预算 | `resource-limit` |
| 无法归类的初始化失败 | `open-failed` |

DRM 是已识别但不支持的内容能力，不伪装成文件损坏。当前 EPUB/CBZ 返回插件内稳定不支持状态及可销毁 controller；不把已识别加密状态伪装成损坏，不等待密码。

## 9. 依赖决策

实施阶段按以下顺序选择：

1. 浏览器平台能力和项目已有、已审核的 ZIP/图片/PDF 路径；
2. 小型、维护活跃、许可证清楚、可精确锁定的 TypeScript/JavaScript parser；
3. 可裁剪、可在 Worker 中终止、可复现构建的 C/C++/Rust WASM；
4. 无安全边界、只能整书转码、需要上传、许可证不兼容或长期无人维护的方案拒绝。

EPUB.js 经比较未采用；libmobi、DjVu.js 和 libarchive 的固定样例/许可与未通过门禁见 [阶段 0 决策](phase-0-decisions.md)，尚不是运行依赖。选用前必须用固定语料验证能力，不能根据 README 或底层库的理论格式列表直接进入 Manifest。

## 10. 规范与候选上游

- [EPUB 3.3](https://www.w3.org/TR/epub-33/) 与 [EPUB Reading Systems 3.3](https://www.w3.org/TR/epub-rs-33/)
- [EPUB.js](https://github.com/futurepress/epub.js)
- [libmobi](https://github.com/bfabiszewski/libmobi)
- [DjVu.js](https://github.com/RussCoder/djvujs)
- [libarchive](https://github.com/libarchive/libarchive)
