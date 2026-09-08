# 查看器插件渲染规范

本文负责 `open(context)` 取得容器后的 DOM、布局、第三方渲染器、内容安全与性能。生命周期与错误的完整契约见[插件协议](viewer-plugin-protocol.md)，共享组件见[共享 UI 与渲染架构](viewer-ui-and-rendering-architecture.md)。

## 1. 容器与 DOM 所有权

宿主容器占据工作区剩余空间，使用可收缩布局和 `overflow: auto`，并继承以下主题变量：

`--viewer-background`、`--viewer-foreground`、`--viewer-border`、`--viewer-accent`、`--viewer-font-family`。

插件只能依赖容器和公开变量，不能依赖宿主 React 结构、class、固定高度或窗口尺寸。

- 每次打开创建独立根节点，只修改自己拥有的节点；不修改、替换或移除宿主容器，不修改 `body` / `html`。
- class、动画名和自定义属性使用插件或共享组件前缀，CSS 选择器限定在根节点内。
- 文件名等纯文本使用 `textContent`，不把未处理的文件内容拼入 `innerHTML`。
- 销毁只移除本实例的根节点，并清理外部副作用；不依赖宿主随后清空容器。

## 2. 尺寸与滚动

先确定每个内容区域的滚动所有者，再建立高度链；不要用全局 wheel 拦截、修改 body overflow 或手工转发滚轮修补布局。

### 宿主滚动

自然向下增长的文档优先由宿主容器滚动。根节点随内容增长，不再设置滚动层：

```css
.anyfile-example-viewer {
  box-sizing: border-box;
  min-height: 100%;
  width: 100%;
}
```

工具栏可用 `position: sticky; top: 0`。不要对自然文档设置 `height: 100%` 后任其内容溢出，也不要用超过视口的固定最小高度模拟内容区。

### 插件内部滚动

固定工具栏/侧栏、虚拟列表或第三方库要求明确滚动节点时，使用确定高度的根节点与可收缩内容面板：

```css
.anyfile-example-viewer {
  display: flex;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  width: 100%;
  flex-direction: column;
  overflow: hidden;
}
.anyfile-example-viewer__toolbar { flex: none; }
.anyfile-example-viewer__viewport {
  min-height: 0;
  min-width: 0;
  flex: 1;
  overflow: auto;
}
```

- flex/grid 高度链中的可收缩中间节点都需 `min-height: 0`；仅 `min-height: 100%` 不能建立内部滚动高度。
- 将实际内容面板作为第三方库的 `scrollContainer`，不引入争夺同一内容滚动的父子层。
- 独立侧栏可以各自滚动；同一内容的横纵滚动尽量归同一面板。
- 超宽内容不能撑宽整页，应横向滚动或缩放。窄、矮窗口中仍要保留可达的内容区。

## 3. 第三方渲染器

接入前确认节点所有权、全局样式、监听器和销毁 API。

- 文档挂载点、样式输出节点和工具栏分开。会清空传入节点的库只能获得专用节点，不能传入它们的共同父节点。
- 库生成的 class 也需限定作用域；若无法满足，应采用适合该格式的隔离渲染方案。
- 用 `ResizeObserver` 观察实际内容面板，不只读取一次 `window.innerHeight`。
- `destroy()`、`close()`、`terminate()` 等纳入插件清理；明确资源所有权，避免重复释放或泄漏。
- 不在模块顶层创建 renderer、DOM、Worker 或大型运行时。

## 4. 异步工作与状态

初始化应先检查取消与资源上限，建立基础 UI 和可靠清理路径，再开始需要的读取与渲染。异步边界后检查实例是否仍有效；快速切换页码或文件时，过期结果不得覆盖新状态。

- 失败、取消和 `dispose()` 使用一致的资源清理路径；销毁幂等，之后停止 DOM/Canvas 更新和延迟回调。
- 释放根节点、监听器、observer、frame、timer、Worker、Object URL、媒体及 GPU 资源。
- `open()` 未完成时用本地化 `reportProgress()` 更新宿主遮罩，避免重复的全屏加载覆盖。
- 需要用户输入时先返回控制器，再由插件 UI 等待；后台加载、局部错误和用户取消也由 active 插件管理。
- `open()` 返回或清理开始后不再调用 `reportProgress()`。错误码与 opening/active 所有权见[插件协议](viewer-plugin-protocol.md)。

## 5. 主题与可访问性

- 使用宿主主题变量并提供回退值，样式不覆盖宿主颜色方案、字体或焦点。
- 用户可见文案、标题和 ARIA 使用 `context.locale`；长标签可截断，但保留完整可访问描述。
- 按钮、选择器、交互画布支持键盘并具有名称，保留可见焦点，不禁用浏览器页面缩放。
- 加载状态使用 `role="status"`，错误按场景使用 `role="alert"`，避免高频进度反复打断读屏。
- 动画和持续可视化尊重 reduced-motion；非必要的持续绘制在不可见或停止时暂停。

## 6. 内容安全

- 不执行文档脚本、宏、事件属性或嵌入主动内容。HTML/SVG 经安全处理或在受限、无脚本沙箱中展示，不能直接注入宿主。
- 外部链接只允许明确支持的协议，设置 `rel="noreferrer noopener"`。
- 不上传文件内容、文件名、本地路径或解析结果，也不自动请求文件中引用的远程图片、字体、媒体、tile、脚本或 iframe。
- 必须支持的远程子资源需明确来源 allowlist、隐私边界和失败降级，并满足[加载部署约定](viewer-loading-and-deployment.md)的跨源隔离要求；链接存在不代表可以建立任意网络连接。
- 不通过本站 API、rewrite、Worker 或外部服务代理任意用户 URL；公共运行时资产必须来源固定、版本锁定且与文件内容无关。
- 不用外部 iframe 执行文件主动内容，不为绕过 COEP 关闭查看页隔离。
- 本地关联文件经 `context.workspace` 读取并传递 `signal`；Object URL 限当前实例使用并在清理时撤销。
- 用户错误提示不能暴露文件内容、敏感路径或解析器堆栈。

## 7. 性能与验收

大文件优先分片、流式、按需或虚拟化。必须整体读取的第三方库需根据真实内存模型设置输入、解压、像素/几何或输出上限；不能只限制原文件大小而忽略展开成本。

图片、页面或幻灯片按可见范围处理，避免一次生成大量 DOM 或 Canvas。滚动/resize 不同步触发完整重排或重新解析，合并绘制，避免读写布局交错。

新增插件或渲染改动按相关范围验证：

- 短内容填充合理，长内容可到达末尾，无无意义双滚动；超宽内容不撑宽整页。
- 窄/矮窗口、侧栏调整和 resize 后，工具栏与内容仍可使用。
- 快速切换、读取中取消、渲染中取消、重复销毁后，无旧内容、监听器、声音或后台任务残留。
- 空、损坏、缺资源和超限输入产生明确状态；插件不修改测试容器外 DOM。
- 用真实格式样例完成渲染冒烟；涉及滚动时使用超过一屏的文件做真实浏览器检查，DOM mock 不证明 `scrollHeight` 和布局正确。
- 代码变更通过相关测试、`pnpm lint`、`pnpm build`；共享层变更覆盖实际调用方。
