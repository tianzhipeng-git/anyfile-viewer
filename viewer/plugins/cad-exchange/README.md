# CAD 交换格式查看器 (`cad-exchange`)

通过源码构建的 OCCT Worker，将 CAD 交换文件离散化为可浏览几何。

## 基本介绍

- **插件 ID**：`cad-exchange`
- **格式入口**：`.step`、`.stp`、`.iges`、`.igs`、`.brep`
- **能力**：STEP/STP、IGES/IGS、BREP 的面、边界、装配名称和颜色查看。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/index.ts](src/index.ts) 有界完整读取输入，为每次导入创建独立 Worker。
2. OCCT 内核离散化几何，输出交给 [src/adapter.ts](src/adapter.ts) 转换为共享三维场景；导入结束即销毁 Worker。
3. STEP/IGES 单位归一为毫米；BREP 单位未知，界面不假定其真实物理单位。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/runtime-assets` | 锁定版本的运行时资产加载与来源回退 |
| `@anyfile/rendering-3d` | 共享三维视口、相机交互与场景资源管理 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |
| `three@0.185.1` | 三维几何与 WebGL 渲染 |

OCCT 审核资产由项目部署；完整源码构建配方见 [tools/occt-import-build](../../../tools/occt-import-build/)，普通应用构建只校验和复制资产。

## 已知限制

- 输入最大 16 MiB、内核堆 256 MiB；输出最多 100 万顶点和 50 万三角形。
- 仅提供离散几何查看，不进行精确 CAD 编辑、PMI 展示或几何有效性认证。
- 上游畸形输入公告及剩余限制见[依赖审计](../../../docs/3d/dependency-audit.md)。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [3D 支持矩阵](../../../docs/3d/support-matrix.md)与[实现状态](../../../docs/3d/implementation-status.md)。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/cad-exchange-viewer test
```
