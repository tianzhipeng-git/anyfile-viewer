# 源码构建型第三方依赖规范

本文适用于项目从第三方源码生成的 WASM、Worker、JavaScript glue 和数据资产。运行时分发与响应头见[加载部署约定](viewer-loading-and-deployment.md)。

## 1. 何时自行构建

优先使用浏览器原生能力或安全、受维护、许可清楚、可锁定的上游包。上游包缺少必要能力或裁剪选项、存在适用安全问题，或无法满足 CSP/加载边界时，才维护源码构建。

在对应依赖的构建说明或领域架构中保留自建原因及关键替代方案，不在通用规范中积累选型过程。窄 adapter 能解决的问题不应升级成长期 fork。

## 2. 输入、审核产物与部署产物

```text
tools/<dependency>-build/                  可重复构建配方
        ↓
third_party/<dependency>/<artifact-version>/  审核后的版本化产物
        ↓ prepare 校验与复制
public/vendor/<dependency>/<artifact-version>/  生成的部署资源
```

| 目录 | 必须保留 | 不应放入 |
|---|---|---|
| `tools/` | 上游版本/URL/哈希、锁定工具链、构建脚本、adapter、必要 patch、smoke 与重建说明 | 浮动分支或来源不明的源码副本 |
| `third_party/` | 运行产物、`build-info.json`、许可证/声明、必要源码与重链接材料 | 临时 build tree、缓存和未使用的二进制 |
| `public/vendor/` | prepare 生成的运行文件及需公开分发的材料 | 唯一源码、唯一许可证原件或手工维护版本 |

前两层提交 Git，`public/vendor/` 由 Git 忽略且可重新生成。源码默认从锁定 archive 下载到临时目录，不以长期 clone、浮动 branch 或 submodule 代替版本与哈希。

可从 lockfile 锁定 npm 包恢复的运行产物不重复提交到 `third_party/`。缺失的许可补充材料放在 `licenses/<package>/<version>/`，由 prepare 复制。

## 3. 版本与可复现性

项目构建产物使用 `<upstream-version>-anyfile.<build-revision>`：上游变化更新上游版本；adapter、patch、工具链或参数变化递增构建 revision。运行 URL、prepare、策略和构建检查使用同一精确版本。

已发布版本 URL 的字节必须保持不变，不能覆盖旧内容；不使用 `latest`、浮动 URL 或未锁定的容器 tag。

`build-info.json` 至少记录：

- 产物版本及所有上游组件版本、源码 URL、commit/tag、归档 SHA-256；
- 工具链版本和容器 digest、功能开关及关键编译/链接参数；
- adapter/patch revision；
- 产物文件名、字节数和 SHA-256。

构建时间可作审计元数据，但不能改变运行产物。重建须比较文件清单和内容哈希；不可避免的非确定字段需说明并验证差异范围。

## 4. 构建与应用发布分离

普通 `pnpm dev`、`pnpm test`、`pnpm build` 不编译 C/C++/Rust，也不临时下载 native 源码。首次接入、升级、构建参数变化或复现验证时才运行源码配方。

Prepare 必须：

- 从指定审核版本读取，校验 build info、清单、大小和 SHA-256 后输出；
- 复制到精确版本化目录，不扫描“最新版本”或静默回退旧版本；
- 公开分发所需的许可证、声明、源码和重链接材料。

应用 URL 不直接指向 `tools/` 或本地 `third_party/`。公开仓库审核产物可通过完整 Git commit 的 jsDelivr URL 分发，镜像与同源 fallback 遵守加载部署约定。

## 5. 升级与 Patch

升级作为一组变更验收，不能只替换 WASM：

1. 核对上游维护、安全与许可变化，更新源码和工具链锁定信息。
2. 重建产物，验证可复现性；检查体积、初始化时间和峰值内存变化。
3. 验证真实样例、损坏输入、资源上限、取消与清理。
4. 同步 glue/adapter、许可证、build info、公开源码材料、运行 URL、prepare 和资产策略。
5. 通过相关测试、`pnpm lint`、`pnpm build`，并完成真实部署资产与目标浏览器验证。

必要 patch 以独立文件记录原因、适用版本和删除条件；已有上游 issue/PR 时关联它。优先升级正式修复，不长期堆叠 backport。持续改变上游行为或需要独立发布节奏时，重新评估正式 fork。

单应用消费时配方与产物留在本仓库。出现多项目消费、独立安全发布或多平台构建等实际需要时，再考虑独立版本包；不预先拆仓。

## 6. 资源、安全与许可边界

- 核对适用于当前构建的已知漏洞，不能继续使用已知适用的 critical 漏洞版本。
- 保留上游安全限制，并根据真实内存模型限制输入、解压和输出；重型解码置于可终止 Worker，不能把 Worker/WASM 等同于可信文件沙箱。
- 不通过放宽 CSP、临时 CDN 或服务端转换绕过依赖问题；必要 CSP 变更须单独验证。
- 按该依赖的分发要求提供许可证、NOTICE、对应源码、修改说明和重链接/替换材料；具体许可选择与其他分发限制保留在该依赖文档中。

不满足接入条件的能力保持未交付状态，不能仅依据底层库支持列表对外声明。

## 7. 验证分层

**Prepare / 构建检查**验证产物清单、哈希、版本引用、必需分发文件、体积预算，以及重型代码未进入 manifest、probe、查看页首包或无关插件。

**浏览器 / 部署验收**验证真实初始化、取消和释放，以及最终 URL 的 MIME、缓存、CORS/CORP、COEP 和 CSP。构建检查不能证明线上响应头或 CDN 可用。

测量结果、重建日志和具体发布操作放在依赖的审核/验证材料中；本文只维护通用规则。
