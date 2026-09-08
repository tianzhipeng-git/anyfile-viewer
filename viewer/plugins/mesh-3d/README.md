# 三维网格与场景查看器 (`mesh-3d`)

在浏览器本地查看通用三维网格和 glTF 场景。

## 基本介绍

- **插件 ID**：`mesh-3d`
- **格式入口**：`.stl`、`.obj`、`.ply`、`.off`、`.glb`、`.gltf`
- **能力**：STL、OBJ/MTL、PLY、OFF、glTF 2.0/GLB；共享相机交互，有动画片段时显示动画控制。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/index.ts](src/index.ts) 按扩展名分别动态加载格式适配器，输入最大 64 MiB。
2. STL 解析放在可终止 Worker；其他适配器目前解析有上限的完整输入。
3. OBJ 的 MTL/纹理与 glTF 关联资源通过已授权工作区解析；文件内远程 URL 不发起请求，纹理只接受 PNG/JPEG。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/rendering-3d` | 共享三维视口、相机交互与场景资源管理 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `three@0.185.1` | 三维几何与 WebGL 渲染 |

各格式按需加载，共享视口与场景资源管理由 `@anyfile/rendering-3d` 提供。

## 已知限制

- 没有工作区时无法补全缺失的关联文件；外部资源必须位于允许访问的工作区。
- 未配置高级压缩和部分材质特性，不支持彩色 OFF 或任意外部 buffer-view 图像；OFF 多边形当前假定为凸多边形。
- 动画控件依赖 glTF clips，专门的动画样例验证仍待补充；不提供编辑、修复或转换。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。
- [3D 支持矩阵](../../../docs/3d/support-matrix.md)与[实现状态](../../../docs/3d/implementation-status.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/mesh-3d-viewer test
```
