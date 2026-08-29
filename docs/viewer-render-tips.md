# 查看器插件渲染规范

本文规定查看器插件在右侧预览区渲染内容时必须遵守的布局、滚动、样式、生命周期和安全约束。协议字段和插件注册方式见 [viewer-plugin-protocol.md](viewer-plugin-protocol.md)，本文只讨论 `open(context)` 取得 `context.container` 之后的渲染行为。

## 1. 宿主提供什么

`context.container` 是宿主拥有的预览容器，当前具有以下能力：

- 占满右侧工作区扣除宿主标题栏后的剩余空间。
- 使用 `min-height: 0` 参与 flex 布局，窗口较矮时仍可收缩。
- 默认设置 `overflow: auto`，可以承担水平和垂直滚动。
- 提供 `--viewer-background`、`--viewer-foreground`、`--viewer-border`、`--viewer-accent` 和 `--viewer-font-family` 主题变量。
- 切换文件或插件时中止 `signal`、调用 `dispose()`，然后清空容器。

插件只能把它视为一个尺寸会变化的空容器，不能依赖宿主的 React 结构、Tailwind class、固定像素高度或当前窗口大小。

## 2. DOM 所有权

插件必须为每次 `open()` 创建一个独立根节点，并且只修改该根节点及其后代：

```text
context.container                 宿主拥有
└── .anyfile-<plugin>-viewer      当前插件实例拥有
    ├── style                     可选，样式必须带插件前缀
    ├── toolbar                   可选
    └── content                   实际查看区
```

必须遵守：

- 不修改、替换或移除 `context.container` 本身。
- 不读取或修改容器外的 DOM，不给 `body`、`html` 或宿主节点添加 class 和内联样式。
- 根 class、子节点 class、动画名和 CSS 自定义属性都使用插件专属前缀，例如 `anyfile-word-viewer`。
- 不使用无作用域的 `div`、`table`、`img`、`canvas` 等全局选择器。
- 同一个插件连续打开两个文件时，不复用上一次的可变 DOM 或渲染器实例。
- 文件名等纯文本使用 `textContent`；不能把文件内容直接拼进 `innerHTML`。

## 3. 尺寸和滚动

### 3.1 默认模式：由宿主滚动

文档、图片集合、普通表格等自然向下增长的内容，优先使用宿主的 `context.container` 作为唯一滚动容器。

```css
.anyfile-example-viewer {
  box-sizing: border-box;
  min-height: 100%;
  width: 100%;
  /* 不设置 overflow:auto */
}
```

此模式下：

- 插件根节点可以随内容增长，但不能设置第二个 `overflow: auto` 或 `overflow: scroll`。
- 插件工具栏可以使用 `position: sticky; top: 0`，它会相对宿主滚动容器固定。
- 不要给根节点设置 `height: 100%` 后再让内容溢出；自然文档应使用 `min-height: 100%`。
- 不要用大于视口的固定 `height` 或 `min-height` 模拟查看区，否则小窗口中内容可能被裁掉。

Word 查看器属于此模式。之前 DOCX 无法上下滚动的根因，就是插件根节点和宿主同时声明滚动，且插件滚动层只有最小高度、没有确定高度。

### 3.2 内部滚动模式：插件自己滚动

只有以下情况才应使用内部滚动：

- 虚拟列表需要一个明确的 `scrollContainer`。
- 工具栏、工作表标签或侧栏必须始终固定，只有内容面板滚动。
- 第三方渲染库明确要求传入滚动节点。

内部滚动必须形成完整且连续的高度链：

```css
.anyfile-example-viewer {
  display: flex;
  height: 100%;
  min-height: 0;
  width: 100%;
  flex-direction: column;
  overflow: hidden;
}

.anyfile-example-viewer__toolbar {
  flex: none;
}

.anyfile-example-viewer__viewport {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
```

内部滚动模式必须满足：

- 根节点使用确定的 `height: 100%`，同时设置 `min-height: 0` 和 `overflow: hidden`。
- 只有内容面板设置 `overflow: auto`；不要再增加第三层滚动。
- flex 或 grid 高度链中的每个可收缩中间节点都要设置 `min-height: 0`。
- 将内容面板作为第三方库的 `scrollContainer`，不能传入另一个尺寸不确定的后代节点。
- 横向滚动和纵向滚动尽量归同一内容面板管理。

Excel、PowerPoint 等带固定控件或虚拟化内容的查看器可以采用此模式。

### 3.3 禁止的布局写法

```css
/* 错误：min-height 不会给内部滚动建立确定高度 */
.viewer-root {
  min-height: 100%;
  overflow: auto;
}

/* 错误：父子两层都成为滚动容器 */
.viewer-root,
.viewer-content {
  overflow: auto;
}

/* 错误：内容高度可能让 flex 子项拒绝收缩 */
.viewer-content {
  flex: 1;
  /* 缺少 min-height: 0 */
}
```

不要通过监听全局 `wheel` 事件、修改 `document.body.style.overflow` 或手工转发滚轮事件来修复滚动。这些做法会破坏宿主页面，正确做法是修复高度链并确定唯一滚动容器。

## 4. 第三方渲染库

第三方库可能会清空传入节点、插入全局样式、注册窗口事件或创建额外滚动层。接入前必须确认每个参数的所有权和副作用。

- 文档内容节点、样式输出节点和工具栏节点应彼此独立。
- 如果库会执行 `target.innerHTML = ""` 或 `replaceChildren()`，只能把专用空节点传给它。
- 不要把包含工具栏、状态栏或文档挂载点的共同父节点作为库的 `styleContainer` 或渲染目标。
- 库生成的 class 应通过插件根 class 限定样式作用域。
- 库要求窗口尺寸时，优先使用 `ResizeObserver` 监听插件根节点或内容面板；不要只读取一次 `window.innerHeight`。
- 库提供 `destroy()`、`close()`、`terminate()` 等方法时，必须在插件 `dispose()` 中调用。

以文档渲染为例：

```ts
const root = document.createElement("div")
const generatedStyles = document.createElement("div")
const documentHost = document.createElement("div")

root.append(generatedStyles, documentHost)
context.container.append(root)

await renderDocument(bytes, documentHost, generatedStyles)
```

`generatedStyles` 不能传成 `root`。如果渲染库在写入样式前清空它，就会同时移除 `documentHost`，最终出现渲染成功但右侧空白的问题。

## 5. 异步渲染和生命周期

`signal` 可能在读取、解析、加载 Worker 或写入 DOM 的任意阶段触发。插件必须让取消和销毁使用同一套清理逻辑。

推荐顺序：

```text
检查 signal 和资源上限
        ↓
读取文件（支持取消）
        ↓
创建并挂载插件根节点
        ↓
解析 / 渲染（每个异步边界后检查 signal）
        ↓
返回可重复调用的 dispose()
```

必须遵守：

- `dispose()` 可以被重复调用，第二次及以后不能报错。
- `open()` 失败或被取消时，也要执行与 `dispose()` 等价的清理。
- `dispose()` 后不再写 DOM、不再报告进度、不再触发延迟回调。
- 清理插件根节点、全局事件、`ResizeObserver`、定时器、Worker、Object URL、媒体流、GPU 资源和第三方实例。
- 只移除当前实例创建的根节点，不依赖宿主稍后调用 `container.replaceChildren()`。
- 取消统一抛出名称为 `AbortError` 的 `DOMException`；不要把取消包装成文件损坏错误。
- 长时间读取使用流式读取并响应 `signal`，大文件在完整解析前检查资源上限。

## 6. 加载状态和错误

- 在读取、解析、渲染和完成阶段使用 `reportProgress()`，消息应简短且可本地化。
- `open()` 返回前，宿主会显示统一加载遮罩；不要同时渲染另一套覆盖整个查看区的加载页。
- `stage` 只是插件定义的诊断标识，宿主不会根据特定字符串揭开遮罩或改变生命周期。
- `open()` 不得等待密码、字体替换、子资源选择、授权确认等用户操作。先挂载可交互 UI 并返回控制器，再在插件根节点内继续流程。
- `open()` 返回后不得再调用 `reportProgress()`；后台加载和进度由插件在自己的根节点内显示。
- `open()` 成功后的后台整体失败由插件把根节点切换为完整错误状态；页面、字体、缩略图、子资源或部分解码失败只在受影响区域显示，其他内容继续可用。
- 用户取消插件内交互时关闭或重置该交互，保持查看器 active，并提供重试、降级或稳定停止状态；不要调用或模拟宿主的 `signal.abort()`。
- 文件无效使用 `invalid-file`，资源过大使用 `resource-limit`，缺少浏览器能力使用 `unsupported-environment`。
- 错误消息不能暴露文件内容、完整本地路径或解析器堆栈。

## 7. 样式、主题和可访问性

- 优先使用宿主提供的 CSS 变量，并为变量提供安全回退值。
- 插件样式不能覆盖宿主的颜色方案、字体大小、滚动条或焦点样式。
- 可能超宽的内容要允许横向滚动或自适应缩放，不能撑宽整个页面。
- 文件名和长标签应支持截断，但完整值可以放在 `title` 或可访问描述中。
- 按钮、选择器和可交互画布必须支持键盘操作，并提供可识别的名称。
- 加载状态使用 `role="status"`；错误提示使用合适的 `role="alert"`。
- 文档缩放后仍应保持可阅读，不能禁止浏览器页面缩放。

## 8. 内容安全

- 不执行文档内的 JavaScript、宏、事件属性或嵌入式主动内容。
- HTML 和 SVG 等内容必须经过安全处理，不能直接注入宿主页面。
- 外部链接只允许明确支持的协议，并设置 `rel="noreferrer noopener"`。
- Object URL 只用于当前文件实例，并在 `dispose()` 中调用 `URL.revokeObjectURL()`。
- 默认不发出携带文件内容、文件名或本地路径的网络请求。
- 关联文件只能通过 `context.workspace` 读取，并传递当前 `signal`。

## 9. 性能要求

- 插件实现保持动态加载，模块顶层不能初始化 DOM、Worker、WASM 或大型渲染引擎。
- 大文件优先分批、懒加载或虚拟化，避免一次创建数万个 DOM 节点。
- 图片、页面或幻灯片按可见范围渲染；离屏内容应延迟处理。
- 高频滚动和 resize 回调不能同步执行完整重排或重新解析文件。
- 对第三方渲染器设置合理的文件大小、压缩包和媒体资源上限。
- 不要为了固定布局反复读取 `getBoundingClientRect()` 后立即写样式，避免布局抖动。

## 10. 最小验收清单

每个新插件或渲染布局修改至少验证以下场景：

- 短内容能填充查看区，不出现无意义的双滚动条。
- 长内容在右侧查看区内可以滚动到最后一行或最后一页。
- 浏览器窗口高度很小时仍能滚动，工具栏不会把内容完全挤出视口。
- 超宽内容不会撑宽整页，横向滚动或缩放行为符合预期。
- 调整侧栏宽度和浏览器窗口后，内容可以重新适配。
- 连续切换两个文件时，旧内容、旧样式和旧事件不会残留。
- 在读取和渲染过程中取消，后台任务会停止且不显示错误遮罩。
- `dispose()` 连续调用两次不会报错。
- 损坏文件、空文件和超过资源上限的文件返回正确错误码。
- 插件不会修改测试容器外的 DOM。
- 使用真实格式样例完成一次渲染冒烟测试，不能只 mock 第三方渲染函数。
- `npm test`、`npm run lint` 和 `npm run build` 全部通过。

滚动相关改动还应使用至少一个内容明显超过一屏的真实文件，在桌面窄窗口和矮窗口各手动验证一次。DOM 测试环境通常不会计算真实的 `scrollHeight`，不能用单元测试替代这项检查。
