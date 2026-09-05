# 点云预览 (`point-cloud`)

流式读取点云坐标并保留代表性抽样，供浏览器交互预览。

## 基本介绍

- **插件 ID**：`point-cloud`
- **格式入口**：`.pcd`、`.xyz`、`.las`、`.laz`
- **能力**：ASCII PCD/XYZ、LAS、LAZ；渐进显示读取进度和最多 20 万个采样点。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/points.worker.ts](src/points.worker.ts) 在可终止 Worker 中读取坐标；PCD/XYZ/LAS 采用流式路径。
2. LAZ 按需使用源码构建的 laz-perf Worker 运行时，先读入压缩文件再解码。
3. 通过确定性蓄水池采样限制驻留点数；测绘坐标在转 Float32 前重定位原点，输出交给共享三维视口。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/rendering-3d` | 共享三维视口、相机交互与场景资源管理 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `three@0.185.1` | 三维几何与 WebGL 渲染 |

LAZ 除包依赖外需要已部署的 laz-perf 审核资产；普通文本和 LAS 路径不加载该解码器。

## 已知限制

- PCD/XYZ/LAS 输入最多 2 GiB；LAZ 压缩输入最多 64 MiB，WASM 堆上限 256 MiB。
- 当前为等级 2 代表性采样，不展示全部点，也没有完整空间 LOD。
- 不展示颜色、强度或分类属性；不支持 binary PCD 和 E57。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。
- [3D 支持矩阵](../../../docs/3d/support-matrix.md)与[实现状态](../../../docs/3d/implementation-status.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/point-cloud-viewer test
```
