# 源码构建型第三方依赖规范

- 状态：生效
- 适用范围：查看器使用的 C/C++/Rust 等源码构建依赖，以及由此产生的 WASM、Worker、JavaScript glue 或数据资产
- 不适用：能够直接使用且满足要求的普通 registry 依赖

## 1. 使用原则

自行构建第三方依赖是例外，不是默认依赖接入方式。依次评估：

1. 浏览器原生能力是否足够；
2. 上游是否提供安全、受维护、许可证清楚且能满足加载边界的精确版本包；
3. 是否可以通过窄 adapter 使用上游包，而不自行构建；
4. 只有现有包版本存在已知安全问题、缺少必要构建选项、违反 CSP/部署边界或携带大量无关能力时，才进入源码构建流程。

不得只因为“自己编译看起来更可控”就复制上游源码或引入新的 native toolchain。决定自行构建时，格式方案必须记录被拒绝的现成方案和具体原因。

## 2. 三层目录职责

源码构建型依赖使用以下三层：

```text
tools/<dependency>-build/
        │ 可重复构建
        ▼
third_party/<dependency>/<artifact-version>/
        │ prepare 脚本复制
        ▼
public/vendor/<dependency>/<artifact-version>/
        │ Next.js 静态托管
        ▼
/vendor/<dependency>/<artifact-version>/...
```

### `tools/<dependency>-build/`

项目维护的构建配方，提交 Git，包括：

- 上游源码版本、下载地址和 SHA-256；
- 构建容器或工具链版本；
- 构建脚本和最小 adapter 源码；
- 必要 patch；
- 产物校验、真实样例 smoke test 和升级说明。

构建脚本在临时目录下载并解压锁定的 release/source archive。默认不长期 clone 上游仓库，不使用浮动 branch，不用 Git submodule 代替版本和哈希锁定。

### `third_party/<dependency>/<artifact-version>/`

经过审核的版本化构建产物，是应用仓库中的可信输入，提交 Git，包括：

- 浏览器运行所需的 WASM、Worker 和 JavaScript glue；
- `build-info.json` 与每个产物的 SHA-256；
- 上游许可证、第三方声明和必要的对应源码/patch 获取说明；
- 该版本特有但不参与运行的审计材料。

这里不保存临时 build tree、编译缓存或未经使用的上游二进制。完整未修改上游源码通常通过锁定 URL + 哈希 + 构建说明获取；许可证要求或长期 patch 确实需要随分发提供源码时，再存放对应 source archive 或明确的源码分发地址。

### `public/vendor/<dependency>/<artifact-version>/`

部署时由 prepare 脚本生成的同源静态资源目录，不是可信来源，默认不提交 Git。只复制浏览器运行和随分发必须公开的文件。

删除 `public/vendor` 后，必须可以仅凭受版本控制的输入重新生成。浏览器插件只能引用这里的版本化 URL，不能引用 `tools/` 或 `third_party/`。

## 3. 与普通上游包的区别

满足要求的上游 npm 包继续使用现有流程：

```text
pnpm-lock.yaml 锁定的 node_modules 包
        ↓ prepare
public/vendor/<dependency>/<version>/
```

例如当前 PDF.js 与 LibRaw 资产属于这种模式，不需要复制到 `third_party/`。

若普通 registry 包没有随运行产物提供完整的上游许可证或源码获取说明，审核材料保存在 `licenses/<package>/<version>/`，由 prepare 复制到对应的版本化 `public/vendor` 目录。该目录只补充合规材料，不复制运行二进制，也不把普通 registry 包伪装成项目自建产物。

只有项目自己生成、且无法由 `pnpm install --frozen-lockfile` 中的受信任上游包恢复的二进制，才把审核后的产物放入 `third_party/`。不要同时把同一份产物既作为 registry 依赖又提交到 `third_party/`。

## 4. 版本命名与锁定

产物版本使用：

```text
<upstream-version>-anyfile.<build-revision>
```

例如：

```text
1.23.2-anyfile.1
```

- 上游版本变化时更新 `<upstream-version>`；
- adapter、构建参数、工具链或 patch 改变但上游版本不变时递增 `<build-revision>`；
- 插件运行时 URL、prepare 目标、构建检查和文档必须引用同一个精确产物版本；
- 已发布的 artifact version URL 必须保持字节不变；任何产物内容变化都必须产生新的 `<artifact-version>`，不得用同一路径覆盖旧内容；
- 不使用 `latest`、浮动 URL、未锁定容器 tag 或只记录 branch 名。

`build-info.json` 至少记录：

- 产物版本；
- 所有上游组件的版本、URL、commit/tag 和归档 SHA-256；
- 构建工具链与容器 digest；
- 完整功能开关和关键 compiler/linker flags；
- 项目 adapter/patch 的 Git revision；
- 产物文件名、字节数和 SHA-256；
- 构建时间仅作为审计信息，不能影响可复现输出。

## 5. 构建与应用发布分离

普通 `pnpm dev`、`pnpm test` 和 `pnpm build` 不编译 C/C++/Rust。它们只执行轻量 prepare 和完整性检查，保证应用构建快速、稳定且不依赖 native toolchain 或临时外网下载。

源码构建只在以下情况运行：

- 首次引入；
- 上游或工具链升级；
- adapter、patch 或构建参数改变；
- 定期验证可复现性；
- 安全修复要求重建。


## 6. 升级流程

1. 检查上游 release、安全公告、维护状态和许可证变化；
2. 修改锁定版本、源码 URL 和 SHA-256；
3. 在锁定构建环境中重新生成产物；
4. 验证构建可重复，至少比较文件清单和内容哈希；若上游工具链产生不可避免的非确定字段，必须记录并证明差异范围；
5. 运行 decoder/renderer 的真实样例、损坏样例、资源上限和安全回归测试；
6. 记录 raw/gzip 体积、初始化时间和峰值内存变化；
7. 更新许可证、第三方声明、运行时版本 URL、prepare 与 bundle 检查；
8. 运行 `pnpm test`、`pnpm lint` 和 `pnpm build`；
9. 合并后继续监控该精确上游版本的安全公告。

安全升级不能只替换 `.wasm`。adapter API、JavaScript glue、许可证、build info 和真实文件行为都必须作为同一版本验收。

## 7. Patch 与 fork 策略

- 优先使用上游 release 原码和公开构建选项；
- 小型必要修改保存为有说明、有测试的 patch 文件，不直接维护一份来源不明的源码副本；
- patch 必须记录原因、对应上游 issue/PR、适用版本和删除条件；
- 安全修复优先升级到上游正式版本，不长期自行 backport；
- 当 patch 长期存在、显著改变上游行为或需要独立发布节奏时，停止继续堆叠 patch，重新评估正式 fork。

## 8. 何时拆成独立仓库或包

单个应用、单个消费方时，构建配方和审核产物留在当前仓库，便于一个 PR 同时验证 decoder 与插件，不先创建独立仓库。

满足以下任一情况再评估拆分：

- 两个以上项目需要消费同一产物；
- codec 需要独立于应用发布紧急安全版本；
- 出现多平台或多构建变体；
- 构建和回归测试明显拖累应用仓库；
- 需要向内部或公开 registry 发布稳定包。

拆分后优先发布包含二进制、许可证和 build info 的精确版本包。应用从 lockfile 锁定的包复制到 `public/vendor`，不在应用构建期间从浮动 Release URL 下载。

## 9. 安全、许可与部署门禁

每个源码构建型依赖必须：

- 没有命中已知且适用于当前构建的 critical 安全漏洞；
- 保留上游自身安全限制，并按插件真实内存模型增加输入/输出边界；
- 在 Worker 中运行可终止的重型解码；Worker/WASM 仍不视为可信文件沙箱；
- 不使用 `unsafe-eval`，除非单独证明无法避免并完成 CSP 评审；
- 完成许可证、NOTICE、对应源码、修改说明和重新链接/替换要求；
- 对 codec 专利、数据授权等非开源许可证风险留下明确项目决策；
- 通过部署响应头、CSP、跨源隔离和目标浏览器验证。

无法满足时，不用临时 CDN、服务端转换或旧漏洞版本绕过；保持该能力 blocked 或退回浏览器原生路径。

## 10. Prepare 与构建检查

每个依赖的 prepare 脚本必须：

- 从精确的 `third_party/<dependency>/<artifact-version>/` 复制；
- 校验 `build-info.json`、文件清单和 SHA-256 后再输出；
- 写入精确的 `public/vendor/<dependency>/<artifact-version>/`；
- 不扫描“最新版本”目录，不静默回退到旧版本；
- 不在普通应用构建时下载源码或重新编译 native 依赖。

生产构建检查必须验证：

- 插件运行时 URL 与准备的产物版本一致；
- 必需 Worker/WASM/glue/许可证文件存在且哈希正确；
- 重型依赖未进入 `/view` 初始包、manifest、probe 或无关插件 chunk；
- 版本化静态资源返回 `Cache-Control: public, max-age=31536000, immutable`，并具有对应 MIME、COEP/CORP 等部署所需响应头；
- 产物体积变化超过既有基线时构建失败或要求显式评审。
