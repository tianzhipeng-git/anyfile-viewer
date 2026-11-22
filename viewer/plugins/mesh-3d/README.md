# 三维网格与场景查看器 (`mesh-3d`)

在浏览器本地查看通用三维网格和 glTF 场景。

## 基本介绍

- **插件 ID**：`mesh-3d`
- **格式入口**：`.stl`、`.obj`、`.ply`、`.off`、`.glb`、`.gltf`、`.fbx`、`.dae`、`.skp`
- **能力**：STL、OBJ/MTL、PLY、OFF、glTF 2.0/GLB、FBX（ASCII ≥7000 / binary ≥6400）、COLLADA DAE、SketchUp SKP（VFF 及受支持旧版 MFC）；共享三维视口、漫游与动画控制。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/index.ts](src/index.ts) 按扩展名动态加载各格式适配器：STL、FBX/DAE、SKP 均在独立可终止 Worker 中解析。
2. FBX/DAE 使用 Three.js 解析器（窄补丁见 [patches/three-worker.md](../../../patches/three-worker.md)）与 `linkedom@0.18.13` Worker XML DOM，纹理在主线程按像素预算解码。
3. SKP 使用 `openskp@1.3.0` + [patches/openskp@1.3.0.patch](../../../patches/openskp-memory.md) 按定义流式解析 TLV，输出内部 GLB 交由本地 glTF 适配器转换。
4. OBJ 的 MTL/纹理、glTF 与 FBX/DAE 关联资源仅通过授权工作区解析；文件内远程或越界 URL 不发起请求，纹理仅接受 PNG/JPEG。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/rendering-3d` | 共享三维视口、漫游、相机交互与场景资源管理 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `three@0.185.1` | 三维几何、FBX/DAE/glTF 加载器与 WebGL 渲染 |
| `openskp@1.3.0` | SketchUp SKP Worker 解析（含内存补丁） |
| `linkedom@0.18.13` | COLLADA DAE Worker 内轻量 XML DOM |

各格式按需加载，共享视口与场景资源管理由 `@anyfile/rendering-3d` 提供。

## 已知限制

- 输入预算：OBJ 最大 256 MiB，其他格式主文件最大 128 MiB；共享场景上限 600 万顶点、256 MiB 缓冲、4096 次绘制；glTF/SKP/FBX/DAE 总解码纹理 64 Mi 像素。
- SKP 单条目展开上限 512 MiB、总展开 768 MiB、解析超时 60 s；FBX/DAE 限制 1,200 万标量、10 万节点与 120 s 超时。
- 没有工作区时无法补全缺失的关联文件；未配置 Draco/Meshopt/KTX2 压缩、独立 SKP 边线/动态组件、高级着色器与物理/运动学，OFF 多边形假定为凸多边形；不提供编辑、修复或转换。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。
- [3D 与 CAD 架构及支持矩阵](../../../docs/domains/3d.md)。

在仓库根目录运行插件测试：

```bash
pnpm test viewer/plugins/mesh-3d
# 可选本地大 SKP 模型回归（不入库）
SKP_TEST_FILE=/abs/model.skp pnpm test viewer/plugins/mesh-3d
```
