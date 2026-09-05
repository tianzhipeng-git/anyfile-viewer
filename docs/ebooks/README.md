# 电子书查看规划

- 状态：阶段 0–2 首批交付已完成；EPUB 2/3 reflowable 与 CBZ 已实现并通过固定语料/生产浏览器验收
- 范围：浏览器本地、只读地查看流式电子书、固定页电子书和漫画归档
- 不包含：编辑、格式转换、云端书架、账号同步、DRM 绕过和服务端解密/转码

## 文档导航

- [架构](architecture.md)：插件边界、阅读模型、内容隔离、资源和生命周期
- [格式清单](format-inventory.md)：格式族、变体、候选路径和明确排除项
- [支持矩阵](support-matrix.md)：当前事实、规划目标、证据与等级口径
- [实施路线图](roadmap.md)：阶段、交付物、验收门禁和优先级

- [阶段 0 决策](phase-0-decisions.md)：ZIP 提取、隔离方案、候选依赖停止门禁和资源预算
- [验证记录](verification.md)：测试、生产构建、浏览器证据和复现方法

## 一句话方案

已交付 EPUB 2/3 和 CBZ 的本地阅读；下一阶段用第二个流式调用方 FB2 验证是否提取共享阅读层；随后分别 spike MOBI/AZW、CBR/CB7/CBT、DjVu 和 CHM。PDF、TXT、HTML 等已有路径不重复实现，受 DRM 保护的内容明确不支持解密。

## 文档约束

- “规划支持”不等于 Manifest 已声明或运行时已经支持；
- 格式按真实“容器 + 内容版本 + 布局/压缩/加密组合”验收，不按扩展名计数；
- 用户文件、书名、封面和阅读位置均不得离开浏览器；
- 文档中的候选依赖必须在实施阶段重新审核精确版本、许可证、CSP、体积、维护状态和固定样例；
- 实现时同时遵守[查看器插件协议](../viewer-plugin-protocol.md)、[渲染规范](../viewer-render-tips.md)、[共享 UI 与渲染决策](../viewer-ui-and-rendering-proposal.md)、[加载与部署约定](../viewer-loading-and-deployment.md)；自行构建 decoder 时还要遵守[源码构建型第三方依赖规范](../viewer-source-built-dependencies.md)。
