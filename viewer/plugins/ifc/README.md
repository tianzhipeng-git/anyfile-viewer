# IFC 建筑模型查看器 (`ifc`)

## 基本介绍

- **插件 ID**：`ifc`，等级 3
- **格式入口**：IFC2X3、IFC4、IFC4X3_ADD2 的 STEP 文本 `.ifc`。不声明 IFCZIP、IFCXML 或不兼容 schema alias。

## 实现原理

- web-ifc 0.0.78 官方 npm JS/WASM（MPL-2.0），独立模块 Worker，强制单线程。来源 jsDelivr → R2 同版本镜像 → 同源，回退仅覆盖初始化；模型错误不重复解析。
- `StreamAllMeshes` 将几何转换为米、Y-up，保留变换、构件名、颜色和透明度，共享几何按 ID 复用；超过 256 个构件时按 IFC 类型分组显隐。
- 接入 `@anyfile/rendering-3d` 共享总览、观察点放置和漫游。

## 预算

主文件 128 MiB；IFC 数据内存配置 512 MiB；输出 600 万顶点、256 MiB 几何、4,096 次绘制；解析 120 秒超时或取消后终止 Worker。空的轴线/曲线三角网格不视为文件损坏，不计绘制预算。

## 已知限制

不提供属性表、完整空间层级、纹理、碰撞、重力、BIM 校验或精确测量；web-ifc 未支持的几何可能省略。

## 开发与验证

- [fixtures/room.ifc](fixtures/room.ifc) 为原创 6 × 4 × 3.2 米房间，验证毫米转米、Y-up、变换、名称与颜色。

```bash
pnpm test viewer/plugins/ifc
# 本地大模型（不入库）
IFC_TEST_FILE=/absolute/path/to/model.ifc pnpm test viewer/plugins/ifc
```
