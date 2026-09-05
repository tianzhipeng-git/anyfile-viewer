# 三维打印模型查看器 (`print-3d`)

读取 3MF 与未压缩 AMF 的打印模型几何，在共享三维视口中预览。

## 基本介绍

- **插件 ID**：`print-3d`
- **格式入口**：`.3mf`、`.amf`
- **能力**：3MF build 几何、组件、变换和单位；AMF 三角形体积网格。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/index.ts](src/index.ts) 检查 64 MiB 输入上限，再按需加载 3MF 或 AMF 适配器。
2. 3MF 按 ZIP 条目读取，限制条目数、实际解压字节、XML 结构和对象递归；AMF 完整读取 XML。
3. 解析出的几何交给共享三维视口，统一管理相机与销毁。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/rendering-3d` | 共享三维视口、相机交互与场景资源管理 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `three@0.185.1` | 三维几何与 WebGL 渲染 |
| `@zip.js/zip.js@2.8.60` | ZIP 目录读取与所需条目解压 |

3MF ZIP 读取依赖 zip.js，几何与交互复用 Three.js 和共享三维运行时。

## 已知限制

- 3MF 纹理、逐面属性和必需扩展未覆盖。
- AMF 不支持 constellation、材质、曲面三角形或压缩编码。
- 只预览几何，不判断可打印性，不提供修复、切片、排版或导出。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。
- [3D 支持矩阵](../../../docs/3d/support-matrix.md)与[实现状态](../../../docs/3d/implementation-status.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/print-3d-viewer test
```
