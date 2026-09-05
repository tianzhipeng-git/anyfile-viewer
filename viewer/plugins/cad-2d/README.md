# CAD DXF 查看器 (`cad-2d`)

解析 ASCII DXF，在共享三维视口中查看保留 XYZ 坐标的工程图。

## 基本介绍

- **插件 ID**：`cad-2d`
- **格式入口**：`.dxf`
- **能力**：线、点、面、采样曲线、块变换及文字；标准视图、轨道旋转、平移、缩放、适应窗口及图层显隐。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/probe.ts](src/probe.ts) 最多读取 64 KiB，识别 ASCII DXF。
2. 完整输入送入可终止 Worker，由 dxf-parser 解析并展开实体；场景保留单位，GPU 坐标转 Float32 前重定位原点。
3. 共享三维视口提供正交/透视与顶/前/右/等轴视图；图层初始显隐遵守 off/frozen，支持全部显示和单层显示。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `dxf-parser@1.1.2` | ASCII DXF 解析 |
| `@anyfile/rendering-3d` | 共享三维视口、相机交互与场景资源管理 |
| `three@0.185.1` | 三维几何与 WebGL 渲染 |

实体解析与 Three.js 渲染分离，取消可终止解析 Worker；销毁时释放几何、控件及 GPU 资源。

## 已知限制

- 输入最大 64 MiB、展开实体最多 20 万、图元顶点最多 300 万。
- 不支持二进制 DXF 或 DWG；通用 OCS extrusion、精确样条、纸空间、高级标注、填充和原生字体不在当前范围。
- 文字使用朝向相机的精灵；当前为主要内容等级 3，不承诺完整 CAD 保真。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。
- [3D 支持矩阵](../../../docs/3d/support-matrix.md)与[实现状态](../../../docs/3d/implementation-status.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/cad-2d-viewer test
```
