# DWG 查看器 (`cad-dwg`)

## 基本介绍

- **插件 ID**：`cad-dwg`，等级 3
- **格式入口**：`.dwg`，有界签名探测识别 AC1012–AC1032
- 图纸在浏览器中读取，独立 Worker 内解析，不上传、不调用服务端转换。

## 实现原理

- 使用实际 `*Model_Space` 图块，避免把 `database.entities` 中其他空间的对象混入场景。
- 支持线、圆弧、圆、多段线（含 bulge）、椭圆、可用控制点/节点的 NURBS、面与点。
- 应用 OCS 任意轴算法、图块基点、嵌套缩放/旋转/镜像、阵列偏移与属性文字。
- 显示 TEXT、MTEXT、缓存 DIMENSION 图块、基础 LEADER/MULTILEADER、带孔实心 HATCH 与基础图案填充。
- 共享交互视口提供标准视图、平移、缩放和图层显隐；文字使用有预算的图集和绘图平面几何。
- 原生解析警告、上游未知图元数和适配器省略/近似对象分别保留并展示。

## 运行时与预算

- 自建 `0.14-anyfile.1`：GNU LibreDWG 0.14、libredwg-web 0.7.10 绑定、Emscripten 4.0.10。构建配方见 [tools/libredwg-build](../../../tools/libredwg-build/README.md)，应用构建只校验和复制。
- WASM 初始内存 64 MiB，最大 512 MiB；C 栈 5 MiB 并启用 `STACK_OVERFLOW_CHECK=2`（默认 64 KiB 栈会在 2010/2018 样例上触发 `table index is out of bounds`，堆与栈是不同预算）。
- 预算：文件 128 MiB；解析/转换 30 秒；最多 20 万展开图元、200 万几何顶点、2000 条文字、10 万文字字符；8 张 2048² 文字图集。超限返回 `resource-limit`。
- 来源 `R2 → 同版本同源`，仅初始化失败时切换；解析失败不重新处理用户文件。每次尝试使用独立 Worker，初始化成功后才 transfer 文件；取消、成功和失败都终止 Worker。

## 许可证

LibreDWG 为 GPL-3.0-or-later，绑定为 GPL-3.0。DWG 组合分发受 GPLv3 约束，不能以 Worker 隔离豁免。构建生成 `/source/dwg.html`、对应应用源码下载、GPL 文本及内核/绑定源码下载，查看器提供可见链接；发布应用时必须同时提供这些文件。许可声明见根目录 `THIRD_PARTY_NOTICES.md`。

## 已知限制

仅模型空间；不提供布局、外部参照、代理对象、ACIS 三维实体或动态图块参数求值。字体为系统替代字体，不加载 SHX；文字排版、虚线填充、复杂引线、非默认填充样式和部分实体线宽为近似。缺少控制点的样条会提示省略。未逐对象与 AutoCAD/ODA 核对，不声称完整 DWG 保真。

## 开发与验证

- [格式声明](src/manifest.ts)、[内容探测](src/probe.ts)、[打开入口](src/index.ts)。
- 仓库不分发 DWG 样例；样例来源见 [dwg-fixture-sources.json](../../../docs/3d/dwg-fixture-sources.json)，原生回归结果见 [dwg-native-smoke.json](../../../docs/3d/dwg-native-smoke.json)。
- 截断和伪造文件必须以原生错误拒绝，不构建场景。

```bash
pnpm test viewer/plugins/cad-dwg
# 本地真实样例（不入库）
DWG_TEST_FILES='["/abs/a.dwg"]' pnpm test viewer/plugins/cad-dwg/src/native.test.ts
```
