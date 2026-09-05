# 格式查看器插件协议 v2

本文定义宿主与插件之间的接口、路由和生命周期。类型与校验实现见 [viewer/protocol](../viewer/protocol/src/index.ts)，注册入口见 [viewer-registrations.ts](../src/lib/viewer-registrations.ts)。

具体布局见[渲染规范](viewer-rendering-guidelines.md)，代码与资产加载见[加载部署约定](viewer-loading-and-deployment.md)，共享包边界见[共享 UI 与渲染架构](viewer-ui-and-rendering-architecture.md)。这些文档保留有效约束；格式覆盖、待办和验证记录放在各领域文档中。

## 1. 范围与职责

文件只在浏览器本地读取和查看，不上传、不编辑、不转换或导出。优先扩大有实际查看价值的格式覆盖，同时保持轻量和有界资源使用。

- **宿主**：取得文件与目录权限，维护文件选择与工作区，筛选和排序插件，加载选中的实现，提供容器、打开遮罩和生命周期管理。
- **插件**：校验和解析文件，在容器内建立 UI，管理格式交互、后台任务和资源释放。
- **共享包**：复用已稳定的 UI、解析或运行时能力，不改变宿主协议，也不作为候选插件注册。

协议不依赖 React 或其他 UI 框架，不规定统一工具栏、渲染器、Worker 实现、插件间通信或状态持久化。

## 2. Manifest

```ts
interface ViewerPluginManifest {
  readonly protocolVersion: 2;
  readonly id: string;
  readonly name: LocalizedText;
  readonly formats: readonly SupportedFormat[];
  readonly workspaceAccess: "none" | "optional" | "required";
}

interface SupportedFormat {
  readonly name: LocalizedText;
  readonly extensions: readonly string[];
  readonly fileNames?: readonly string[];
  readonly mimeTypes?: readonly string[];
}
```

- `id` 全站唯一，使用小写字母、数字和单连字符分段。
- 每条格式至少声明一个扩展名或完整文件名。扩展名小写、带前导点，支持 `.tar.gz` 等复合扩展名；`"*"` 匹配任意文件。
- `fileNames` 是不含路径分隔符的完整文件名；文件名和扩展名匹配均不区分大小写。
- `mimeTypes` 只作展示，不参与路由。同一插件匹配多条规则时只出现一次。
- `LocalizedText` 英语名称必填，未提供的语言回退英语；仓库 i18n 测试另外要求插件及格式具有非空简体中文名称。
- Manifest 只能包含纯数据和类型，不得导入运行时文案、probe、完整插件、Worker/WASM 或访问浏览器全局。

新增插件还需在 [file-type-icon.tsx](../src/components/file-type-icon.tsx) 中加入文件树语义分类，并通过对应覆盖测试；图标不是协议字段。

## 3. 注册与加载

```ts
interface ProbeViewerContext {
  readonly file: File;
  readonly signal: AbortSignal;
}

interface ViewerPluginRegistration {
  readonly manifest: ViewerPluginManifest;
  probe?(context: ProbeViewerContext): Promise<ViewerSupportLevel>;
  load(): Promise<FileViewerPlugin>;
}

interface FileViewerPlugin {
  readonly manifest: ViewerPluginManifest;
  open(context: OpenViewerContext): Promise<ViewerController>;
}
```

宿主静态导入 `/manifest`，注册项在 `probe()` 中动态导入 `/probe`，在 `load()` 中动态导入完整插件。没有 probe 时不加载探测代码。加载后校验插件 Manifest，且 `id`、`protocolVersion` 必须与注册项一致。

完整插件只有 `open()` 入口；解析与渲染可以在内部拆分，不另建公共 `process()` / `render()` 协议。

## 4. 路由

1. 按 `fileNames`、`extensions` 和通配声明收集候选。
2. 没有工作区时移除 `workspaceAccess: "required"` 的候选。
3. 并行执行候选 probe；没有 probe 的等级为 1。
4. 移除等级 0，按等级降序、显式注册顺序升序稳定排列。
5. 加载选中的插件。初始选择取排序首项，其他候选可由用户手动切换。

Probe 完成顺序不能影响排序。打开失败由宿主展示错误，不自动尝试下一个插件。没有匹配声明的专用插件不参与探测；无扩展名或错误扩展名的全局内容识别不属于当前协议。

排序不因用户选择而改变。宿主当前会在同一挂载会话内沿用仍在候选中的手动选择；这不是跨会话持久化协议。

## 5. 支持等级与 Probe

### 5.1 全项目支持等级

```ts
type ViewerSupportLevel = 0 | 1 | 2 | 3 | 4 | 5;
```

| 等级 | 名称 | 含义 |
|---:|---|---|
| 0 | 不支持 | 不能有意义地打开当前文件，移出候选 |
| 1 | 检查 | 可靠展示底层字节、元数据或结构 |
| 2 | 代表性预览 | 缩略图、摘要、扁平结果或代表性子集 |
| 3 | 主要内容 | 主要内容可用，但存在明确的格式能力缺失 |
| 4 | 完整查看 | 在声明范围内覆盖主要内容和常见格式语义 |
| 5 | 领域查看 | 在等级 4 基础上提供理解格式所需的领域导航或交互 |

等级反映真实能力；控件更多或支持缩放不自动提高等级。文件名足以确定能力时可以返回固定等级，子格式或浏览器能力影响支持时才需细化探测。

实现能力与验证状态分开记录。缺少可再分发样例不等于不支持，应在支持矩阵标记待验证并补充证据；底层依赖理论上支持，但项目没有识别和打开路径的格式不能加入 Manifest。

### 5.2 Probe 约束

- 只读取确定等级所必需的有界文件头或结构，不执行完整解析、渲染或重型引擎初始化。
- 不创建 UI、修改 DOM、执行文件主动内容，或发出依赖当前文件内容的网络请求。
- 响应 `signal`，取消时抛出标准 `DOMException(..., "AbortError")`。
- 非取消异常、非整数或超出 `0..5` 的返回值均按等级 0 处理，不影响其他候选。
- `open()` 必须独立校验文件，不能把 probe 当作安全或完整性检查。

## 6. 打开上下文

```ts
interface OpenViewerContext {
  readonly file: File;
  readonly relativePath?: string;
  readonly workspace?: WorkspaceReader;
  readonly container: HTMLElement;
  readonly signal: AbortSignal;
  readonly locale: Locale;
  readonly reportProgress: (progress: ViewerOpenProgress) => void;
}

interface ViewerOpenProgress {
  readonly stage: string;
  readonly message?: string;
  readonly loaded?: number;
  readonly total?: number;
}

interface ViewerController {
  dispose(): void | Promise<void>;
}
```

- `file` 是标准浏览器 `File`。优先使用 `slice()`、`stream()` 或 Object URL；整体 `arrayBuffer()` / `text()` 必须有明确输入上限。
- `relativePath` 是当前文件在授权工作区中的路径，使用 `/`；普通文件选择时可不存在。
- `container` 由宿主拥有。插件创建独立根节点，不修改容器本身或容器外 DOM。
- `signal` 表示整个实例终止，涵盖 opening 和 active 阶段。
- `locale` 来自 `@anyfile/i18n`。所有用户可见文案及无障碍名称均按此生成，不读取 `navigator.language`；缺失翻译回退英语。

`reportProgress()` 只在 `open()` 未完成且未开始清理时调用。`stage` 是稳定诊断标识，不是宿主状态控制指令；用户文案通过本地化 `message` 提供。已知总量时，`loaded` / `total` 单位相同并满足 `0 <= loaded <= total`；未知时两者都省略。

## 7. 关联文件

```ts
interface WorkspaceReader {
  open(path: string, options?: { signal?: AbortSignal }): Promise<File | null>;
  list(directory?: string, options?: { signal?: AbortSignal }): AsyncIterable<WorkspaceEntry>;
}

interface WorkspaceEntry {
  readonly name: string;
  readonly relativePath: string;
  readonly kind: "file" | "directory";
}
```

宿主不向插件暴露原始目录 handle。[工作区实现](../src/lib/workspace-reader.ts) 提供两种只读来源：授权目录以当前文件所在目录为根；多选文件可形成扁平内存工作区，没有子目录访问，文件名冲突时不建立该工作区。

- 路径使用 `/`，禁止绝对路径、反斜杠、空路径段、`.` 和 `..`，不允许向父目录访问。
- `open()` 不接受空路径；目标不存在或类型不匹配返回 `null`。
- `list()` 默认列根目录，空字符串合法；目录不存在时迭代为空，返回路径相对于 reader 根。
- 权限或读取错误抛出异常；读取和列举传递当前 `signal`。
- `none` 表示插件不需要关联文件；`optional` 必须能提供单文件降级；`required` 没有工作区时不进入 probe 或 `open()`。

## 8. 生命周期与错误

`open()` 完成时必须已建立基础 UI、初始化继续运行与清理所需的资源，并返回可安全销毁的控制器。不要求大文件全部解析完成，可以展示初始内容、内部加载状态或交互入口。

`open()` 不得等待密码、字体替换或子资源选择等用户操作。先建立 UI 并返回控制器，再由 active 阶段处理交互与后续加载。宿主打开遮罩只覆盖初始化阶段，不根据特殊 `stage` 揭开。

| 情况 | 处理方式 |
|---|---|
| `open()` 初始化失败 | 插件先清理部分资源，再 reject；宿主显示统一错误 |
| opening 或 active 被宿主取消 | 停止任务；取消不显示为错误，控制器存在时执行 `dispose()` |
| active 后台整体失败 | 插件在根节点内显示完整错误状态，控制器仍可销毁 |
| active 局部失败 | 在受影响内容附近显示，其他内容继续使用 |
| 用户取消插件内交互 | 插件保持 active，回到可重试、降级或稳定停止状态 |

切换实例时，宿主先 abort，等待旧打开操作结束并销毁控制器，再清空容器、打开新实例。每次 `open()` 的可变状态必须独立；`dispose()` 幂等且不报错。失败、取消和销毁都必须释放 DOM、监听器、定时器、Object URL、Worker、媒体及 GPU 资源，之后不得更新 DOM 或报告进度。

取消使用标准 `AbortError`，其他初始化错误使用 `ViewerError(code, message, { cause })`：

| code | 含义 |
|---|---|
| `invalid-file` | 内容损坏或不是所声明的格式 |
| `missing-related-file` | 缺少必要关联资源 |
| `unsupported-environment` | 浏览器缺少必要能力 |
| `resource-limit` | 超出可安全处理的资源上限 |
| `open-failed` | 其他初始化失败；未知错误归入此类 |

用户错误消息按 locale 生成，不包含文件内容、敏感路径或解析器堆栈。协议校验诊断保持稳定英文，不能直接作为用户文案。

## 9. 隐私、依赖与版本

- 不上传文件内容、文件名、本地路径或解析结果，不执行文件中的脚本或宏。
- 关联内容只读取 `file` 和工作区允许的资源；主动内容处理见[渲染规范](viewer-rendering-guidelines.md)。
- 公共脚本、WASM、字体等可以按[加载部署约定](viewer-loading-and-deployment.md)从锁定的受控来源加载；这些请求不得依赖用户文件内容。
- `@anyfile/viewer-protocol` 只维护协议、校验、错误及 i18n 辅助导出，不引入 UI 或 renderer 依赖。
- 当前只维护 v2，不预建多版本兼容层。接口改变时同步修改宿主、所有调用方和测试；不兼容版本必须拒绝加载。

## 10. 验证入口

- [协议与路由测试](../src/lib/viewer-protocol.test.ts)：Manifest、注册唯一性、匹配、probe 等级、稳定排序和取消；[i18n 测试](../src/i18n/i18n.test.ts)检查已注册名称与文案边界。
- [工作区测试](../src/lib/workspace-reader.test.ts)：路径限制、目录与多文件读取。
- [共享测试工具](../viewer/testing/src/index.ts)：容器、进度、延迟及跟踪读取辅助；具体成功、失败、取消和资源释放由各插件测试覆盖。
- 新增或修改插件需验证成功打开、损坏与超限输入、opening/active 取消、重复销毁及销毁后无副作用。真实渲染和布局验收见[渲染规范](viewer-rendering-guidelines.md)。

测试工具不是自动合规认证；mock renderer 的测试不能替代真实格式和浏览器验证。
