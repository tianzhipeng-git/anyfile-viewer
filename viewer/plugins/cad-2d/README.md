# CAD 2D 工程图查看器 (`cad-2d`)

基于 `dxf-parser` 与 Canvas 2D 的 ASCII DXF 只读查看器，用于在浏览器本地预览二维矢量工程图。

## 基本介绍

- **插件 ID**：`cad-2d`
- **支持格式**：`.dxf`
- **能力**：解析常见 2D 图元，并在可拖拽、缩放、旋转的 Canvas 2D 画布中渲染
- **MIME 匹配**：`application/dxf`、`image/vnd.dxf`

## 实现原理

1. **Probe**（`src/probe.ts`）
   - 只读取前 64 KiB
   - 拒绝空文件、含 NUL 字节的文件和 `AutoCAD Binary DXF` 二进制变体
   - 检测 `0 / SECTION` 文本结构，命中后返回支持等级 3

2. **读取与打开**（`src/read.ts`、`src/index.ts`）
   - 文件大小上限 64 MiB
   - 优先按 UTF-8 解码，失败时回退 Windows-1252
   - 使用 `reportProgress()` 区分读取、解析、渲染阶段
   - 在所有异步边界响应 `AbortSignal`，失败和 `dispose()` 共用幂等清理

3. **图元解析与展平**（`src/scene.ts`）
   - 使用 `dxf-parser@1.1.2` 解析 DXF 文本
   - 图元上限 200,000 个，图块嵌套深度上限 10 层
   - 支持直线、多段线、圆、圆弧、椭圆、样条、文字、实心、点和标注等常见 2D 图元
   - `INSERT` 图块会被递归展开，圆弧和椭圆按需采样为折线

4. **渲染与交互**（`src/ui.ts`、`src/viewport.ts`）
   - 注入带 `anyfile-cad-2d-viewer` 前缀的样式和固定工具栏
   - 使用 `CanvasSurface` 管理 DPR、尺寸变化和绘制调度
   - 使用 `InteractiveViewport` 提供缩放、平移、旋转、适合窗口和实际大小
   - 以图元边界盒中心为原点绘制，保证不同图幅都能居中显示

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议 |
| `@anyfile/viewer-rendering` | Canvas 视口、DPR 调度与交互控件 |
| `dxf-parser@1.1.2` | ASCII DXF 文本解析 |

## 已知限制

- 仅支持 ASCII DXF，不支持二进制 DXF
- 不支持原生 DWG
- 64 MiB 文件大小硬上限；大文件会整文读入内存
- 剖面线、复杂标注、字体和高级布局会简化或忽略
- 图块、圆弧和椭圆以采样折线近似，不保证 CAD 级保真
- 只读预览，不支持编辑、测量或打印
