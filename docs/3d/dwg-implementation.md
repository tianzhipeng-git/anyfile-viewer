# DWG 正式查看器

日期：2026-09-09。

## 已实现

- `cad-dwg` 正式插件、静态 Manifest、有界签名探测、动态加载、格式页、插件页和文件图标已接入。
- 图纸在浏览器中读取，独立 Worker 内解析，不上传、不调用服务端转换。
- 使用实际 `*Model_Space` 图块，避免把 `database.entities` 中其他空间的对象混入场景。
- 支持常见线、圆弧、圆、多段线（含 bulge）、椭圆、可用控制点/节点的 NURBS、面与点。
- 应用 OCS 任意轴算法、图块基点、嵌套缩放/旋转/镜像、阵列偏移与属性文字。
- 显示 TEXT、MTEXT、缓存 DIMENSION 图块、基础 LEADER/MULTILEADER、带孔实心 HATCH 与基础图案填充。
- 共享交互视口提供标准视图、平移、缩放和图层显隐；文字使用有预算的图集和绘图平面几何，随图块变换。
- 原生解析警告、上游未知图元数和适配器省略/近似对象分别保留。警告数字不是“完整兼容”的证明。

## 运行时与根因修复

自建 `0.14-anyfile.1` 使用 GNU LibreDWG 0.14、libredwg-web 0.7.10 绑定及 Emscripten 4.0.10。源码、工具链摘要、原始归档、完整性哈希与构建配方随运行时分发；正常应用构建只验证和复制。

内核为只读配置，初始 WASM 内存 64 MiB，最大 512 MiB。初次自建的默认 64 KiB C 栈导致 2010/2018 样例随后在绑定中出现 `table index is out of bounds`；显式使用 5 MiB 栈并启用 `STACK_OVERFLOW_CHECK=2` 后，这些样例通过。WASM 堆与 C 栈是不同的预算，单纯调整初始堆不能修复此问题。

参考：[Emscripten 栈设置](https://emscripten.org/docs/tools_reference/settings_reference.html#stack-size)、[栈溢出调试说明](https://emscripten.org/docs/porting/Debugging.html)。0.14 也包含上游 [CVE-2026-62254 修复](https://github.com/LibreDWG/libredwg/security/advisories/GHSA-gp83-hcvh-g255)。这不等于宣称解析器不存在其他缺陷。

预算：文件 16 MiB；解析/转换 30 秒；最多 20 万展开图元、200 万几何顶点、2000 条文字、10 万文字字符；8 张 2048² 文字图集。超限返回 `resource-limit`。关闭/取消直接终止 Worker；成功和失败均清理 Worker，场景由查看器生命周期回收。

## 资产与许可证

`R2 → 同版本同源`，仅初始化失败时切换来源；解析失败不重新处理用户文件。每次尝试使用独立 Worker，成功初始化后才 transfer 文件。

已发布到现有 `anyfile-bucket` 的 `vendor/libredwg/0.14-anyfile.1/`，公共入口为 `https://assets.anyfile.top/vendor/libredwg/0.14-anyfile.1/`。公开资产逐项 SHA-256 校验通过，运行时 MIME 正确，CORS 为 `*`，CORP 为 `cross-origin`，缓存为 `public, max-age=31536000, immutable`。冷启动三文件合计约 2134.9 KiB gzip；源码归档不参与冷启动。

LibreDWG 为 GPL-3.0-or-later，绑定为 GPL-3.0。原项目材料保留 Apache-2.0；DWG 组合分发受 GPLv3 约束，不能以 Worker 隔离豁免。许可声明统一见根目录 `THIRD_PARTY_NOTICES.md`。构建生成 `/source/dwg.html`、对应应用源码下载、GPL 文本及内核/绑定源码下载；查看器提供可见链接。发布应用时必须同时提供这些文件。

## 验收

- 六份真实文件通过正式内核和几何适配器，见 [原生回归记录](dwg-native-smoke.json)。所有样例的 WASM 堆均为 64 MiB；最大样例约 2 MiB，不能外推到超大工程图。
- 建筑样例：1921 个展开对象，26602 个几何顶点，80 条文字；原生警告 72。仍有线宽、虚线填充、多重引线图块等近似/省略项。
- 截断文件和伪造文件均以原生错误 512 拒绝，不构建场景。
- DWG 33 项常规自动测试通过（另有一项真实文件测试，指定样例时运行），覆盖模型空间选择、OCS、图块基点、缓存标注、属性、NURBS、bulge、带孔填充、浮点重定位、签名探测、资源回退、解析超时、取消和幂等释放。
- 真实 Chrome 使用 loopback 文件白名单验收正式插件；文件选择器自动化不可用，因此不声称已自动化验收原生文件选择器。主站格式页在生产构建中返回 200。
- Chrome 早期出现 R2 初始化超时，以及直接访问元数据时的 `net::ERR_BLOCKED_BY_CLIENT`，同源回退成功（每轮两个 Worker 均释放）。随后复测走通 R2 首选路径：仅一个 Worker，建筑图约 2115 ms 进入视口。未修改浏览器设置。解析请求发出后取消，两个累计 Worker 均终止，画布为 0。详见 [正式浏览器记录](dwg-production-browser-smoke.json)。
- `pnpm lint`、TypeScript、生产构建与 bundle/asset 门禁通过。各查看器工作区测试通过；应用测试有一个既有失败：Insta360 `ffmpeg-playback.ts` 直接判断 locale，违反现有 i18n 合约，HEAD 中同样存在，与本次 DWG 无关。

应用代码尚未部署到主站；仅新的版本化运行资产已发布到 R2。

## 当前边界

仅模型空间；不提供布局、外部参照、代理对象、ACIS 三维实体或动态图块参数求值。缓存图块可静态展开。字体为系统替代字体，不加载 SHX；文字排版、虚线填充、复杂引线、非默认填充样式和部分实体线宽仍为近似。缺少控制点的样条会提示省略。未逐对象与 AutoCAD/ODA 核对，不声称完整 DWG 保真，也未完成 Safari/Firefox/移动设备验收。
