# 初始依赖审计 — 2026-09-05

## 已采用：Three.js 0.185.1

已在 workspace 消费包和 lockfile 中精确锁定；类型包锁定到 0.185.4。
许可证为 MIT，上游仓库为 https://github.com/mrdoob/three.js 。runtime 只会随完整 3D 插件加载。addons 按格式分别导入。Manifest/probe 不会引入模块级 renderer、Worker 或浏览器全局初始化。
生产 bundle 门禁会检查 `/view` 首次加载 bundle 中的 Three.js 标记。
这是一份依赖/加载审查，不是已经完成的安全 fuzz 审计。

## 已采用：zip.js 2.8.60

沿用项目现有版本，许可证 BSD-3-Clause，仓库为 https://github.com/gildas-lormeau/zip.js 。
打印相关实现使用有边界的 central entry 处理、实际输出计数、CRC 校验、abort signal 和本地 ZIP 读取。
不会请求任何由 3MF 控制的 URL。

## 拒绝 registry 二进制；采用源码构建：occt-import-js 0.0.23

主要文档：https://github.com/kovacsv/occt-import-js 。registry 对应的 gitHead 为：
`c2148e54b456b571238d35cac037d304053d64b2`。其公开 API 提供 STEP、IGES 和 BREP 导入、输出单位、tessellation 容差，以及 mesh/face 颜色。

实际 registry 压缩包只下载到了临时审计目录；
没有把其中任何运行时依赖或二进制加入本仓库。

| 产物 | 原始字节 | gzip 字节 | SHA-256 |
|---|---:|---:|---|
| occt-import-js.js | 96,871 | 26,731 | 3fb44ce11d00611f9b3f3c5775d520ebab48930c1f08279b7b1316f05f0d3379 |
| occt-import-js.wasm | 7,604,031 | 3,091,630 | 33391fc9d94ea5c869a6718488bf0a9a464222bac9bdc764dfe1690cef281952 |

在发布出来的 glue 中观察到：`getHeapMax=()=>2147483648`，并允许动态内存增长。
内存来自模块导出的 memory；公开导入 API 暴露了 tolerance，但没有预分配或输出数量预算。结果以 JS number array 形式返回，因此 tessellation 还会在 WASM heap 之外创建输出。
这些观察并不能证明该 kernel 不安全。它们只说明：仅凭输入大小，无法为本应用建立可靠的内存预算。

采用的 `0.0.23-anyfile.1` 构建将 WASM 内存上限设为 256 MiB（初始 32 MiB），禁止动态执行，并且是纯 Worker ES module。曾尝试过 `worker,node` 构建，但它生成了 Node module import，浏览器测试中被拒绝；该问题已在编译阶段修正。输出上限在 JS array append 之前就于 C++ 层执行：100 万顶点/法线、50 万三角面、10 万面、4096 个 mesh/node、深度 64。Worker 通过 transfer 传递 typed array，并在完成或取消后立即终止。

OCCT WASM 为 3010.9 KiB gzip（level 9），JS/WASM 冷启动合计 3035.8 KiB，超过单资源 2 MiB 门槛，使用 `R2 → 同源`，不再声明 same-origin 例外。两个来源均锁定 `0.0.23-anyfile.1`：`https://assets.anyfile.top/vendor/occt-import-js/0.0.23-anyfile.1/` 与 `/vendor/occt-import-js/0.0.23-anyfile.1/`。审核产物尚未进入公开不可变 Git commit，因此暂不配置 jsDelivr，也不以 npm 原版替代自定义构建。

回退复用 `@anyfile/runtime-assets`，每个来源使用新 Worker。资源加载、Worker 启动或内核初始化失败（包括 20 秒初始化超时）后，先终止失败 Worker，再尝试下一来源。内核 ready 后才 transfer 用户文件；解析错误、资源超限和取消不会切换来源。成功、失败和取消均释放 Worker。源码 URL、hash、LGPL 通知、OCCT exception、完整 patch 和构建说明与可替换模块一同分发。应用构建只会校验/复制已审查资产，不会现场编译。

### OCCT 资产发布验收 — 2026-09-05

`anyfile-bucket/vendor/occt-import-js/0.0.23-anyfile.1/` 已上传 JS、WASM、许可证、源码/patch/构建说明和 build-info，共 10 个文件。使用 `node scripts/check-occt-assets-online.mjs` 独立执行联网验收（不加入离线 build）：所有文件的字节数和 SHA-256 与审核产物一致，MIME、公开 CORS、`CORP: cross-origin`、一年 immutable 缓存均通过，重复 GET 均为 `CF-Cache-Status: HIT`。

真实 Chrome 在生产构建本地服务中验证了 R2 成功、仅阻断 R2 WASM、阻断 R2 glue、两源均被阻断、坏 STEP 不回退，以及中英文首页进入查看页的跨源隔离。可用来源下 STEP 立方体正常显示为 300 mm；初始化失败时旧 Worker 先终止，文件只向成功实例 transfer 一次，结束后所有 Worker 均已终止。证据见 [浏览器记录](occt-runtime-browser-smoke.json)。这不代表其他浏览器已验收，也不代表应用代码已部署到线上。

`pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build` 均通过；首包 214.1 KiB gzip，资产门禁显示 `r2 → same-origin`，无同源豁免。

### 已知上游通告与残余风险

[CVE-2026-42481 / GHSA-8wqm-37mp-6rrm](https://github.com/advisories/GHSA-8wqm-37mp-6rrm) 是一条中等风险（5.5）、尚未复审的通告，涉及畸形 STEP/IGES B-spline 数据和循环 oriented edge。 [报告者披露](https://gist.github.com/sgInnora/dfba083d04906283e9c92aea78e2d94a) 指向 OCCT 7.8.1 和更新的开发版本。当前没有明确已知的修复版本。对 8.0.1 的检查仍发现递归的 `OrientedEdge` 端点解析，因此单纯升级版本不能视为修复证据。我们**不宣称**当前构建已经修复该通告，也不宣称这构成完整的安全审计。

当前集成被限制在：每个文件各自使用一个全新的、可终止的 Worker/module，只处理本地用户选择的文件；输入上限 16 MiB，WASM heap 上限 256 MiB，输出有边界，无原生文件系统访问、无文件控制的网络请求，也不会保留上一个文件的 heap。畸形文件仍可能让该 Worker 失败或卡住，直到被取消。这是一个已知的可用性残余风险，不能替代上游 parser 的根本修复。本次审查没有发现适用的高危通告；但“没有公开通告”不等于“没有漏洞”。在提高预算或复用跨文件 Worker 之前，需要重新评估。

## 已采用：有边界的 laz-perf 源码构建

npm 0.0.7 registry runtime 曾使用上游 `point10.las.laz` 样例跑通过，但其生成的 heap 最大值为 2 GiB。现已改用 `0.0.7-anyfile.1`，基于 registry 精确 gitHead `d0d3047e05221421fa0b02b3da4e93797edb2c52` 构建。decoder 的 C++ 代码未修改；只是通过一个小型 CMake recipe 指定为纯 Worker ESM、禁止动态执行、初始内存 16 MiB、最大内存 256 MiB。LAZ 输入上限为 64 MiB；解码后的点进入与 LAS 相同的 20 万 reservoir。两次在锁定的 Linux/amd64 Docker 镜像中的干净构建产出了相同的 JS/WASM hash；当前审查产物使用的就是该 Docker 输出。Apache-2.0 许可证、源码 hash、recipe 与产物 hash 见 `third_party/laz-perf/0.0.7-anyfile.1/`。

## E57 候选：未采用

[e57-js](https://github.com/semehdi/e57-js) 1.0.8，gitHead `69781f6d01f75c28d2e7144094dd26425212ba07`，已同时检查 registry 包和精确源码归档。它的 `Init` 会检测 `window`，从而让 Worker 执行走到 NODEFS 分支。其分发出来的 glue 使用动态执行，并允许数 GiB 级别的 heap。registry 压缩包缺少完整许可证通知；源码中则包含 libE57Format 的 Boost-1.0、Xerces 的 Apache-2.0/NOTICE，以及 CRCpp 的 BSD 通知。后续若要集成，应采用窄化的源码构建 reader，并显式定义 scan/point/heap 预算，而不是伪造浏览器 `window` 或修补生成后的 glue。当前没有加入任何 E57 注册或支持声明。

DWG/USD 以及更深层的 FBX/DAE/3DS 语义，仍属于第 6 阶段下的可选 provider 工作；当前没有引入服务端转换或上传。
