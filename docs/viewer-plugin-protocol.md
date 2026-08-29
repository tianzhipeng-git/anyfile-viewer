# 格式查看器插件协议 v1

## 1. 目标

格式查看器插件协议用于连接网站外壳与不同文件格式的查看器插件。

协议需要满足：

- 一个插件可以支持一种或多种文件扩展名。
- 同一扩展名可以由多个插件竞争，每个插件在路由时返回支持等级；需要区分文件内容时可以通过 probe 细化等级。
- 网站统一管理文件选择、目录授权和插件加载。
- 插件不依赖 React，可以自由选择内部 UI 实现方式。
- 插件可以处理大文件，尽量不要一次性将整个文件读入内存。
- 文件内容只在浏览器本地处理，不上传到服务器。
- 插件可以独立运行和测试，网站部署时统一安装和锁定依赖。

## 2. 总体流程

```text
用户选择文件或文件夹
          │
          ▼
网站外壳取得 File / FileSystemHandle
          │
          ▼
读取文件扩展名
          │
          ▼
筛选所有声明支持该扩展名的插件
          │
          ▼
并行执行候选插件的可选 probe
          │
          ├── 有 probe：返回支持等级，可按需检查文件内容
          └── 无 probe：支持等级默认为 1
          │
          ▼
按支持等级降序排列，同等级保持注册顺序
          │
          ├── 第一个插件作为默认查看器
          └── 其他插件允许用户手动切换
                    │
                    ▼
              动态加载完整插件
                    │
                    ▼
plugin.open({
  file,
  relativePath,
  workspace,
  container,
  signal,
  locale,
  reportProgress,
})
                    │
                    ▼
             ViewerController
                    │
                    ▼
切换文件或插件时 abort() + dispose()
```

第一阶段只按文件名和扩展名产生候选，不对全体插件执行全局格式探测。候选插件可以在第二阶段的 `probe()` 中直接返回与已匹配格式对应的等级，也可以读取必要文件内容后细化等级。网站不在默认插件打开失败后自动尝试其他插件。

## 3. 设计边界

### 3.1 网站外壳负责

- 调用 File System Access API。
- 申请和维护文件、目录权限。
- 构建文件树并记录当前选中文件。
- 按文件名和扩展名筛选候选插件。
- 执行候选插件的可选 probe，并按返回的支持等级稳定排序。
- 只动态加载默认或用户选中的完整插件实现。
- 创建并持有右侧预览容器。
- 控制插件的取消和销毁生命周期。
- 向插件提供受限制的关联文件读取能力。
- 在 `open()` 未完成时展示统一加载遮罩，并显示插件报告的打开进度。

### 3.2 格式查看器插件负责

- 检查并解析自己声明支持的文件。
- 需要返回默认等级 1 以外的等级或参与精确路由时提供轻量 probe，并返回真实支持等级。
- 在网站提供的预览容器内创建完整预览 UI。
- 管理格式特有的状态、控件和交互。
- 在 `open()` 返回后管理后台任务、用户交互、局部加载和局部错误 UI。
- 根据需要使用分片读取、流式读取、Worker、Canvas、WebGL 或 WebGPU。
- 在取消、失败或销毁时释放自己创建的全部资源。

### 3.3 插件内部实现不属于公共协议

插件内部可以使用：

- 原生 DOM。
- Lit。
- Canvas。
- WebGL 或 WebGPU。
- 浏览器原生图片、音频和视频元素。
- 其他不改变公共接口的实现工具。

Lit 只是复杂插件的可选开发建议，不是协议依赖，也不要求所有插件使用。

## 4. 插件声明

一个插件可以声明多组格式和多个扩展名。

```ts
export interface ViewerPluginManifest {
  readonly protocolVersion: 1
  readonly id: string
  readonly name: string
  readonly formats: readonly SupportedFormat[]
  readonly workspaceAccess:
    | "none"
    | "optional"
    | "required"
}

export interface SupportedFormat {
  readonly name: string
  readonly extensions: readonly string[]
  readonly fileNames?: readonly string[]
  readonly mimeTypes?: readonly string[]
}
```

示例：

```ts
export const manifest: ViewerPluginManifest = {
  protocolVersion: 1,
  id: "browser-image",
  name: "浏览器图片查看器",
  formats: [
    {
      name: "浏览器原生图片",
      extensions: [
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".avif",
      ],
      mimeTypes: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/avif",
      ],
    },
  ],
  workspaceAccess: "none",
}
```

Manifest 规则：

- `id` 在整个网站内必须唯一。
- 扩展名统一使用小写并包含前导点。
- 支持 `.tar.gz` 等复合扩展名。
- `"*"` 表示支持任意扩展名，适合十六进制查看器等通用插件。
- `mimeTypes` 只用于页面展示，不参与插件选择。
- 同一插件即使有多条规则匹配，也只在候选列表中出现一次。

网站外壳的目录树图标不是协议字段，但会复用轻量 Manifest 进行文件类型分类。给现有插件增加 `extensions` 或 `fileNames` 时，图标通常会自动跟随；新增插件时，维护者必须同时在 `src/components/file-type-icon.tsx` 中把该 Manifest 加入对应语义类别，新增语义类别时还需指定新的 Lucide 图标。`src/components/file-type-icon.test.ts` 会检查所有已注册的非通配扩展名均能取得明确类别，不能通过删除或放宽该检查来绕过缺失映射。

## 5. 插件选择与支持等级

网站按照显式注册顺序保存插件，不能依赖目录扫描、对象属性、probe 完成顺序或动态导入完成顺序。

### 5.1 全项目支持等级

支持等级描述插件对候选文件实际能够提供的查看能力。它在路由时确定，但不要求返回值必须随文件内容变化：如果文件名或扩展名已经能可靠界定格式，并且插件对该格式的能力一致，可以对所有匹配文件返回同一个等级；内容差异会影响能力时，才需要读取文件并细化等级。

```ts
export type ViewerSupportLevel = 0 | 1 | 2 | 3 | 4 | 5
```

| 等级 | 名称 | 含义 |
|---:|---|---|
| 0 | 不支持 | 插件确认不能有意义地打开当前文件，从候选列表移除 |
| 1 | 检查 | 可靠展示底层字节、元数据或结构信息 |
| 2 | 代表性预览 | 展示缩略图、摘要、扁平结果或代表性子集 |
| 3 | 主要内容 | 主要内容可用，但有明确且有意义的格式能力缺失 |
| 4 | 完整查看 | 在声明范围内完整覆盖主要内容和常见格式语义 |
| 5 | 领域查看 | 在等级 4 基础上提供理解该格式所需的领域导航或交互 |

等级必须根据真实能力返回。控件更多、可以缩放或可以查询不自动构成更高等级。等级 5 必须建立在主要内容已经完整可用的基础上。

支持等级与验证状态是两件事。Manifest 和 probe 描述已经实现的运行时能力；支持矩阵中的 `implemented` / `verified` 描述证据完整度。缺少固定、真实或可再分发样例本身不能成为把已实现格式移出 Manifest、返回等级 0 或对外写成“不支持”的理由。此时应保留真实能力等级并标记为待验证，继续用合成样例、人工取得的文件或有记录的手工验收补齐证据。反过来，只知道底层依赖理论上支持、但项目尚未实现格式识别和打开路径，也不能据此加入 Manifest。

同一个插件可以对不同文件返回不同等级。例如通用 TIFF 插件可以对已完整支持的 TIFF 返回 4，对只能读取元数据的压缩变体返回 1，对损坏文件返回 0。

### 5.2 候选与排序

```text
文件名 / 文件扩展名
    │
    ▼
匹配插件 manifest.extensions
    │
    ▼
并行执行候选注册项的可选 probe
    │
    ├── probe 返回 0：移除
    ├── probe 返回 1..5：使用该动态等级
    └── 没有 probe：等级默认为 1
    │
    ▼
支持等级降序 + 原注册顺序升序
    │
    ├── 第一项：默认打开
    └── 其余项：供用户手动切换
```

选择规则：

- 第一阶段只使用 `fileNames` 和 `extensions` 收集候选；`mimeTypes` 不参与选择。
- 声明 `"*"` 的通用插件属于每个文件的候选，通常不提供 probe，并以默认等级 1 参与排序。
- Probe 的返回值必须反映插件的真实能力。文件名或扩展名足以可靠判断格式且内容差异不影响支持等级时，可以不读取文件并返回固定等级；存在同扩展名竞争、子格式差异或环境能力差异时，应检查必要信息并据此返回等级。
- 所有候选等级确定后按等级降序排列；同等级严格保持 `src/lib/viewer-registrations.ts` 的显式注册顺序。
- Probe 可以异步并行执行，但完成先后不能影响排序。
- 没有可用工作区时，`workspaceAccess: "required"` 的插件在 probe 前从候选中移除。
- 不使用 MIME 决定插件。
- 默认插件打开失败时展示错误，不自动回退到下一个插件。
- 用户切换插件时，先取消并销毁当前插件，再打开目标插件。
- `open()` 仍需严格校验文件；probe 只负责排序，不能取代打开阶段的安全和完整性检查。
- v1 不记录用户上次选择，也不自动调整插件顺序。

该设计有意保留扩展名路由边界：没有匹配文件名或扩展名的专用插件不会进入候选，只会保留声明 `"*"` 的通用插件。无扩展名和错误扩展名的全局格式识别不属于 v1。

## 6. Probe 与延迟加载

网站启动时只加载轻量 Manifest，不加载 probe、完整插件及其重型依赖。

```ts
export interface ProbeViewerContext {
  readonly file: File
  readonly signal: AbortSignal
}

export interface ViewerPluginRegistration {
  readonly manifest: ViewerPluginManifest

  probe?(
    context: ProbeViewerContext,
  ): Promise<ViewerSupportLevel>

  load(): Promise<FileViewerPlugin>
}
```

示例：

```ts
const pdfRegistration: ViewerPluginRegistration = {
  manifest: pdfManifest,

  async probe(context) {
    const module = await import("@anyfile/pdf-viewer/probe")
    return module.probePdf(context)
  },

  async load() {
    const module = await import("@anyfile/pdf-viewer")
    return module.pdfViewer
  },
}
```

Probe 规则：

- Probe 返回 `0..5`。它可以仅根据已匹配的文件名或扩展名返回等级；只有内容会影响格式识别或支持能力时，才需要读取必要的文件头、容器结构或其他有界信息。
- Probe 不创建 UI、不修改 DOM、不初始化完整 renderer，也不执行文件中的主动内容。
- Probe 遵守与 `open()` 相同的大文件原则：优先使用 `file.slice()`，没有明确上限时不得整体调用 `arrayBuffer()` 或 `text()`。
- Probe 必须响应 `signal`；取消时抛出标准 `AbortError`。
- Probe 不上传文件、文件名、路径或探测结果，也不发出依赖当前文件内容的网络请求。
- Probe 发生非取消错误时，该候选按等级 0 处理，不能阻止其他候选继续排序。
- Probe 在运行时返回非整数或 `0..5` 以外的值时，按非取消错误处理。
- Probe 需要读取文件时，只读取足够确定支持等级的内容，不能为了排序执行完整解析或渲染。

没有 probe 的注册项不加载额外代码，直接取得默认等级 1。网站只在候选成为默认项或被用户手动选中时调用 `load()`。完整插件加载后，网站校验其 `id` 和 `protocolVersion` 是否与注册信息一致。

## 7. 插件公共接口

完整插件只暴露一个打开入口，不建立独立的公共 `process()` 或 `render()` 协议。注册项上的可选 `probe()` 只服务于打开前路由，不属于完整插件实例，也不能代替 `open()`。

```ts
export interface FileViewerPlugin {
  readonly manifest: ViewerPluginManifest

  open(
    context: OpenViewerContext,
  ): Promise<ViewerController>
}
```

插件内部可以自由拆分解析器和展示代码，但这种拆分是插件实现细节。

## 8. 打开上下文

```ts
export interface OpenViewerContext {
  readonly file: File
  readonly relativePath?: string
  readonly workspace?: WorkspaceReader
  readonly container: HTMLElement
  readonly signal: AbortSignal
  readonly locale: string

  readonly reportProgress: (
    progress: ViewerOpenProgress,
  ) => void
}
```

### 8.1 `file`

网站持有原始 `FileSystemFileHandle`，调用 `getFile()` 后把浏览器标准 `File` 交给插件。

```text
File System Access API ── getFile() ──┐
<input type="file"> ──────────────────┼──→ File → 插件
拖放文件 ─────────────────────────────┘
```

插件可以直接使用标准 Blob 能力：

```ts
// 分片随机读取
const chunk = await file
  .slice(offset, offset + length)
  .arrayBuffer()

// 顺序流式读取
const stream = file.stream()

// 从指定位置开始流式读取
const partialStream = file.slice(offset).stream()

// 交给浏览器原生元素
const objectUrl = URL.createObjectURL(file)
```

插件不得在没有明确大小上限时直接执行：

```ts
await file.arrayBuffer()
await file.text()
```

小文件可以在设置明确上限后整体读取；大文件必须使用 `slice()`、`stream()` 或浏览器原生 Object URL。

### 8.2 `relativePath`

`relativePath` 表示当前文件在用户授权工作区中的相对路径。通过普通文件选择或拖放单文件打开时可以不存在。

路径统一使用 `/` 作为分隔符。

### 8.3 `container`

`container` 是网站拥有的空预览容器。插件直接在其中建立预览 UI。

```text
container
├── 插件工具栏
├── 页码或缩放控件
├── img / video / canvas
├── 格式专属面板
└── 插件内部状态提示
```

规则：

- 插件只能修改 `container` 内的 DOM。
- 插件不能修改或移除 `container` 本身。
- 插件不能依赖网站内部 class 名。
- 插件可以使用 `ResizeObserver` 监听容器尺寸。
- 插件必须在 `dispose()` 中移除全局监听器及其他外部副作用。

### 8.4 `signal`

`signal` 可能在 `open()` 的任何阶段触发。插件必须停止未完成的读取、解析、渲染和后台任务。

### 8.5 `locale`

`locale` 用于格式专属控件和错误信息的本地化。网站主题通过 `container` 上继承的 CSS 变量提供，不增加单独主题协议。

## 9. 关联文件读取

插件不获得原始 `FileSystemDirectoryHandle`。网站提供以当前文件所在目录为根的只读工作区。

```ts
export interface WorkspaceReader {
  open(
    relativePath: string,
    options?: {
      signal?: AbortSignal
    },
  ): Promise<File | null>

  list(
    relativeDirectory?: string,
    options?: {
      signal?: AbortSignal
    },
  ): AsyncIterable<WorkspaceEntry>
}

export interface WorkspaceEntry {
  readonly name: string
  readonly relativePath: string
  readonly kind: "file" | "directory"
}
```

示例：

```ts
const binary = await workspace.open(
  "model.bin",
  { signal },
)

const texture = await workspace.open(
  "textures/base.png",
  { signal },
)
```

规则：

- 输入路径相对于当前文件所在目录。
- 禁止绝对路径。
- 禁止通过 `..` 越过授权目录。
- 目标文件不存在时返回 `null`。
- 权限失效或读取失败时抛出错误。
- `list()` 使用异步迭代，避免一次为大目录构建巨大数组。

`workspaceAccess` 的含义：

```text
none
└── 插件不需要关联文件

optional
├── 有工作区时读取关联文件
└── 只有单文件时提供降级预览

required
└── 没有工作区时，网站不调用插件 open()
```

## 10. 打开进度

```ts
export interface ViewerOpenProgress {
  readonly stage: string
  readonly message?: string
  readonly loaded?: number
  readonly total?: number
}
```

规则：

- `reportProgress()` 只报告当前 `open()` 尚未完成的工作。`open()` resolve、reject 或插件开始清理后不得再调用。
- `stage` 是插件定义的稳定诊断标识，例如 `"parsing"`；宿主只能展示或记录它，不能根据某个字符串切换遮罩、生命周期或交互状态。
- `message` 是可供用户阅读的说明。
- 只有能准确计算时才提供 `loaded` 和 `total`。
- `loaded` 和 `total` 必须使用同一单位，并满足 `0 <= loaded <= total`；未知总量时两者都省略。
- `open()` 完成前，网站展示统一加载遮罩，插件根节点不能接收用户操作。
- 进度不是状态控制通道。密码输入、字体替换、子资源选择、授权确认等用户交互不得通过特殊 `stage` 请求宿主揭开遮罩。
- `open()` 完成后，插件内部的继续加载、进度和错误由插件自己的 UI 展示，不再调用 `reportProgress()`。

## 11. `open()` 的完成条件

`open()` resolve 时必须满足：

1. 插件已经在 `container` 中建立基础 UI。
2. 用户已经可以看到初始内容或插件自己的内部加载界面。
3. 继续运行所必需的资源和取消/清理路径已经成功初始化。
4. 返回的 `ViewerController` 可以安全调用 `dispose()`。

`open()` 不要求整个大文件已经全部解析。

`open()` 也不得等待用户操作。插件发现需要密码、字体替换、选择子资源或授权时，必须先建立对应的可交互 UI 并返回控制器，再在 active 阶段等待用户。这样宿主无需通过进度字符串推断何时允许交互，切换文件时也始终有可销毁的控制器。

```text
open() 开始
├── 创建基础查看器 UI
├── 读取必要文件头
├── 初始化解析器或后台任务
├── 显示首屏、内部加载状态或交互入口
└── 返回 ViewerController

后台继续
├── 按需读取、解析和渲染剩余内容
└── 必要时在插件 UI 中等待用户操作
```

## 12. 生命周期

```text
registered
    │
    ▼
loading-plugin
    │
    ▼
opening
    ├── 失败 ───────────────→ cleaned
    ├── signal.abort() ─────→ cleaned
    └── 成功
          │
          ▼
        active
          │
          ├── 后台加载 / 等待用户 / 部分可用
          ├── signal.abort()
          ▼
       disposing
          │
          ▼
       disposed
```

规则：

- 每次 `open()` 都对应一个新的插件实例生命周期。
- 插件不能在不同文件之间复用可变内部状态。
- `open()` 被取消时必须停止后台工作并清理部分资源。
- `open()` 失败时，插件负责清理已经创建的资源。
- `dispose()` 必须支持重复调用且不能报错。
- `dispose()` 完成后不能继续更新 DOM。
- 插件不能假设网站一定会先清空 `container`。
- `signal.abort()` 只表示宿主终止整个查看器实例，不表示用户取消了插件内的一次对话框或后台操作。
- 用户取消插件内交互时，插件保持 active，并自行回到可重试、降级或明确的停止状态；不得为此中止宿主持有的 `signal`，也不得把它伪装成打开失败。

网站切换文件或插件时：

```ts
abortController.abort()
await controller?.dispose()
container.replaceChildren()
```

## 13. 查看器控制器

v1 控制器只负责释放资源：

```ts
export interface ViewerController {
  dispose(): void | Promise<void>
}
```

v1 不增加 `reload()`、`resize()`、`focus()`、`save()`、`getState()` 或插件间通信：

- 尺寸变化使用 `ResizeObserver`。
- 焦点使用标准 DOM API。
- 重新加载通过销毁后重新调用 `open()` 完成。
- 插件特有操作由插件自己的 UI 处理。

## 14. 错误协议

取消操作使用浏览器标准 `AbortError`。其他打开错误使用统一错误码。

```ts
export type ViewerErrorCode =
  | "invalid-file"
  | "missing-related-file"
  | "unsupported-environment"
  | "resource-limit"
  | "open-failed"

export class ViewerError extends Error {
  readonly code: ViewerErrorCode
  readonly cause?: unknown

  constructor(
    code: ViewerErrorCode,
    message: string,
    options?: {
      cause?: unknown
    },
  ) {
    super(message)
    this.code = code
    this.cause = options?.cause
  }
}
```

错误码含义：

```text
invalid-file
└── 扩展名匹配，但内容损坏或并非该格式

missing-related-file
└── 文件缺少必要的关联资源

unsupported-environment
└── 当前浏览器缺少必要能力

resource-limit
└── 文件过大或设备资源不足，无法安全打开

open-failed
└── 无法归类的初始化失败
```

规则：

- `AbortError` 不向用户显示为错误。
- `ViewerError` 由网站转换为统一的打开失败界面。
- 未知错误统一视为 `open-failed`。
- 只有 `open()` reject 才进入宿主统一打开失败界面；reject 前插件必须清理自己已经创建的资源。
- `open()` 成功后的错误不再抛给宿主：导致当前内容整体不可继续的后台失败由插件在根节点内展示完整错误状态，仍可使用时的页面、字体、缩略图、子资源或部分解码失败在对应局部展示。
- 插件内用户取消不是错误。插件负责关闭交互 UI，并提供重试、降级或返回稳定状态；宿主不改变文件选择和查看器生命周期。
- 错误信息不得包含文件内容或敏感本地路径。

所有权汇总：

| 情况 | 管理方 | 结果 |
|---|---|---|
| `open()` 完成前的致命失败 | 插件清理，宿主展示 | reject `ViewerError`，宿主显示统一失败界面 |
| 宿主切换文件、插件或关闭查看器 | 宿主发出 `signal.abort()`，插件清理 | `AbortError` 不展示为错误，随后 `dispose()` |
| active 阶段后台任务整体失败 | 插件 | 在插件根节点显示完整错误状态，控制器仍可销毁 |
| active 阶段局部失败 | 插件 | 在受影响内容附近显示，其他可用内容继续工作 |
| 用户取消插件内交互 | 插件 | 保持 active，回到可重试、降级或停止状态 |

## 15. 样式和 UI 约束

网站可以在 `container` 上提供基础主题变量：

```css
.viewer-container {
  --viewer-background: #fff;
  --viewer-foreground: #111;
  --viewer-border: #ddd;
  --viewer-accent: #2563eb;
  --viewer-font-family: system-ui;
}
```

插件可以使用这些变量，但不能依赖网站内部样式结构。

插件必须：

- 将样式限制在自己的 `container` 内。
- 避免向页面插入污染全站的全局样式。
- 在 `dispose()` 中移除全局事件监听。
- 为交互控件提供基本键盘操作和无障碍标签。

不建立统一网站工具栏协议，但是可以弄一些通用的公共组件, 可以基于lit做一些公共逻辑.

## 16. 隐私与安全约束

插件必须遵守：

- 不上传文件内容、文件名、本地路径或解析结果。
- 不将用户文件发送给外部服务。
- 不执行文件中携带的脚本。
- HTML、SVG 等主动内容不能直接注入网站主页面。
- 插件依赖的脚本、WASM 和字体必须随网站构建，不能运行时从任意第三方来源加载。
- 插件只能读取当前 `file` 和 `workspace` 明确允许的文件。
- Object URL、Worker、GPU 资源、定时器和事件监听必须清理。

禁止直接执行：

```ts
container.innerHTML = untrustedFileContent
```

主动内容格式应使用安全文本模式或独立沙箱环境。

## 17. 依赖管理

每个插件在自己的 `package.json` 中声明依赖：

```json
{
  "name": "@anyfile/pdf-viewer",
  "dependencies": {
    "pdfjs-dist": "..."
  }
}
```

根工作区负责统一安装、生成 lockfile 和构建网站。

公共协议包建议命名为：

```text
@anyfile/viewer-protocol
```

它只包含：

- TypeScript 接口。
- `ViewerError`。
- 协议版本常量。
- 少量协议校验工具。

Lit、PDF.js、Three.js 等插件专属库不进入公共协议包。

跨插件复用的无框架 UI 放在独立的 `@anyfile/viewer-ui` workspace 包中，而不是放进协议包。当前表格查看器由它统一负责 DOM、分页交互、空态、局部错误、样式和事件清理；各格式插件只负责解析文件并返回列、行和分页元数据。

`viewer-ui` 保持无运行时框架依赖。表格交互的状态量很小，原生 DOM 可以直接满足需求；如果以后出现复杂组件状态、嵌套视图和大量增量更新，再针对该组件评估 Lit，不把 Lit 强制变成所有插件的基础依赖。

## 18. 协议版本

```ts
export const VIEWER_PROTOCOL_VERSION = 1 as const
```

规则：

- 网站只加载自己支持的协议版本。
- Manifest 与实际插件的协议版本必须一致。
- 仓库只维护当前协议，不为旧接口保留兼容层；协议变更时直接同步修改网站、插件和测试。
- 未来确实需要同时分发不兼容协议时再升级大版本，当前不预建多版本适配。
- 网站遇到不支持的版本时拒绝加载并显示错误。

## 19. 协议合规要求

每个插件必须通过统一的协议合规测试。

```text
Manifest
├── id 合法且唯一
├── 扩展名为小写
├── 复合扩展名合法
└── protocolVersion 正确

Routing
├── 只按文件名和扩展名产生候选
├── probe 返回反映真实能力的 0..5 支持等级
├── 无 probe 的候选默认为等级 1
├── 等级 0 的候选被移除
├── 高等级优先且同等级保持注册顺序
├── probe 失败不阻止其他候选排序
└── probe 可以取消且不读取无上限的完整文件

Lifecycle
├── open() 可以成功完成
├── open() 不等待用户操作
├── open() 失败时自行清理
├── opening 阶段可以取消
├── active 阶段可以取消
├── dispose() 可以重复调用
├── active 阶段后台整体失败和局部失败由插件 UI 管理
└── dispose() 后不再修改 DOM 或报告打开进度

Boundary
├── 不修改 container 外部 DOM
├── 不遗留全局事件监听
├── 不遗留 Object URL
└── 不发送外部网络请求

Large file
├── 不默认整体调用 arrayBuffer()
├── 支持 slice() 或 stream()
└── 插件声明应用层资源上限时，达到上限返回明确错误
```

具体测试实现将在测试设计中确定，本节只定义协议要求。

## 20. v1 明确不包含

- 文件编辑和保存。
- 格式转换和导出。
- 插件之间通信。
- 插件状态持久化。
- 无扩展名或错误扩展名文件的全局格式检测。
- 默认插件失败后的自动回退。
- 远程文件和服务器上传。
- 缓存策略。
- 强制指定插件 UI 技术。
- React 组件协议。
- Worker、WASM 的具体打包配置。
- 网站路由、SEO 页面和文件树实现。
