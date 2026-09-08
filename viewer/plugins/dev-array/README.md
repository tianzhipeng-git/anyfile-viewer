# NumPy 数组查看器 (`dev-array-viewer`)

以有界读取方式检查 NumPy 数组，并分页展示数组值与逻辑坐标。

## 基本介绍

- **插件 ID**：`dev-array-viewer`
- **格式入口**：`.npy`、`.npz`
- **能力**：NPY 1.0–3.0、NPZ 条目选择、dtype/shape/顺序信息、数组值分页。
- **数据处理**：文件在浏览器本地只读处理，不上传。

## 实现原理

1. [src/index.ts](src/index.ts) 建立数组查看界面；解析器读取 NPY 头部并计算数据偏移。
2. C-order 与 Fortran-order 共用物理分页读取，再映射逻辑坐标；数值、布尔、定长字符串、Unicode、复数、日期时间和结构化 dtype 按类型解码。
3. NPZ 从 ZIP 中央目录建立索引；Stored 条目直接 range 读取，DEFLATE 条目流式解压至所需头部或页面。

## 依赖

| 包 | 用途 |
|---|---|
| `@anyfile/dev-binary-core` | 二进制游标与有界文件读取 |
| `@anyfile/viewer-protocol` | 插件协议、错误类型与本地化辅助 |

二进制游标与文件读取复用 `@anyfile/dev-binary-core`；`fflate` 仅是开发依赖，不作为插件运行时依赖。

## 已知限制

- Object dtype 仅用于结构检查，绝不反序列化内嵌 Pickle。
- NPY 头部最多 1 MiB、维数最多 32；NPZ 最多 10,000 条目、中央目录最多 32 MiB。
- 所选数组最多 2 GiB，压缩条目比例上限 1000:1；压缩数组访问后部页面仍需要解压前序数据。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 扩展名用于收集候选，实际选择按探测等级及同级注册顺序确定；MIME 仅作说明，详见[插件协议](../../../docs/viewer-plugin-protocol.md)。
- [样例说明](examples/README.md)：查看样例范围、来源或生成方法。

在仓库根目录运行插件测试：

```bash
pnpm --filter @anyfile/dev-array-viewer test
```
