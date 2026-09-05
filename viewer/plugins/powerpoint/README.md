# PowerPoint 查看器 (`powerpoint-presentation`)

在浏览器中预览 Office Open XML 格式的演示文稿（`.pptx`）。

## 基本介绍

- **插件 ID**：`powerpoint-presentation`
- **支持格式**：`.pptx`（`application/vnd.openxmlformats-officedocument.presentationml.presentation`）
- **能力**：幻灯片列表渲染、懒加载媒体与幻灯片、自适应缩放
- **不支持**：旧版 `.ppt`、`.odp`、宏、动画播放

## 实现原理

1. **打开流程**（`src/index.ts`）
   - 文件大小上限 80 MiB
   - 校验 ZIP 魔数（`PK\x03\x04`）
   - 流式读取为 `ArrayBuffer`

2. **渲染**（`@aiden0z/pptx-renderer`）
   - `PptxViewer.open(bytes, slidesContainer, options)`
   - `renderMode: "list"` — 垂直列表展示各幻灯片
   - `lazySlides: true`、`lazyMedia: true` — 按需渲染幻灯片与嵌入媒体
   - `listOptions: { batchSize: 4, initialSlides: 4, windowed: true }` — 窗口化批量加载
   - `fitMode: "contain"` — 幻灯片适应容器宽度
   - `pdfjs: false` — 不启用内嵌 PDF 幻灯片渲染
   - 使用 `RECOMMENDED_ZIP_LIMITS` 限制 ZIP 解压规模

3. **UI**
   - 工具栏 + 可滚动幻灯片区域
   - 销毁时调用 `viewer.destroy()` 释放资源

## 依赖

| 包 | 用途 |
|---|---|
| `@aiden0z/pptx-renderer@1.2.4` | PPTX 幻灯片渲染 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

## 已知限制

- 仅 `.pptx`，不支持 `.ppt`、`.odp`、`.ppsx`
- 80 MiB 文件大小硬上限
- 不播放动画、过渡效果、音视频自动播放
- 复杂 SmartArt、3D 模型、嵌入 Excel 图表等可能渲染不完整
- 内嵌 PDF 页（`pdfjs: false`）不会渲染
- 演讲者备注、批注不展示
- 整文件读入内存；幻灯片/媒体懒加载仅优化渲染阶段
- 只读预览，不可编辑或导出

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/powerpoint-viewer test
```
