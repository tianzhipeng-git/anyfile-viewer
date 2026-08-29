# SEO 与格式推广策略

- 状态：提案
- 用途：指导格式选型、着陆页文案和关键词挖掘；

## 1. 核心用户路径

典型转化场景：

> 用户收到一种不熟悉或打不开的文件 → 不想安装 2GB 桌面软件、也不愿上传到陌生网站 → Google 搜 `xxx file viewer online` / `open xxx without uploading` → 拖入 Anyfile Viewer → 30 秒内本地打开

这条路径的特点是：**意图极强、竞品分散、local-first 是真实卖点**。SEO 应围绕「打不开的单个文件」而不是「又一个万能转换器」来布局。

## 2. 定位：常见格式做门槛，长尾格式做差异化

项目 README 的原则是「支持的格式超级多，追求格式多而不是支持等级高」。从推广角度，这应解读为**不对称策略**，而不是「每个格式都投同等的工程与 SEO 资源」。

| 层级 | 格式示例 | 产品目标 | SEO 目标 |
|---|---|---|---|
| 信任门槛 | PDF、PNG/JPG、原生可播的 MP4/WebM | 让用户觉得站点靠谱；用浏览器原生能力低成本覆盖 | 不作为主战场，避免与 CloudConvert、Google 预览同质化 |
| 差异化主战场 | MKV、HEIC、Parquet、SQLite、相机 RAW、旧 Office | 解决「浏览器/在线工具打不开」的痛点 | 每个格式一条 `/formats/[extension]` 着陆页；主打「免上传、本地打开」 |
| 证据驱动长尾 | Reddit/论坛抱怨、竞品差评、Search Console 零结果查询 | 有搜索与痛点证据再加格式 | 用 SERP、Trends、论坛帖扩词后再立项 |

**结论：推广上应刻意偏长尾和高痛点格式；产品上不能只做长尾。** 常见格式保留浅层支持当「前门」，工程预算优先给「竞品做不好 + 搜索有需求 + local-first 真有价值」的组合。

## 3. 格式选型三问

「越冷门越好」不是充分条件。每个候选格式必须同时过三道筛：

1. **有没有搜索需求？** 零搜索量的极冷门格式，做了也带不来流量。
2. **痛点够不够强？** MKV、HEIC 对特定人群不是「冷门」，而是「常用但浏览器/轻量工具打不开」——这才是高价值目标。视频 roadmap 中「按真实使用频率选候选」与此一致。
3. **工程成本是否匹配回报？** 在「只查看、要轻量、大文件友好」约束下，极重且受众极小的专业格式不应优先。

### 优先支持

- 浏览器原生打不开，但用户手里经常有的格式（MKV、各类 RAW、旧 Office 二进制）
- 敏感/专业文件，用户不愿上传（数据库、HAR、设计源文件、医学/地理数据）
- 现有在线工具体验差（要注册、要排队、要上传整文件、只给 metadata）

### 刻意不做深

- 已有大量免费桌面工具且用户很少为此搜索的格式
- 纯靠扩展名堆数量、无法 honest 声明支持范围的容器家族
- 与「本地查看、不上传」叙事冲突的格式（流媒体协议、DRM、需服务端转码）

## 4. 对外叙事

### 推荐强调

- 「收到 `.mkv` / `.heic` / `.parquet`？拖进来，不上传，本地打开。」
- 「免费 · 在线 · 免上传 · 隐私 · 快速 · 全能」
- 每个格式页说明：适用场景、支持范围边界、示例文件、与上传型工具的对比

### 避免

- 「支持 100+ 格式」——与竞品同质化，无法传达楔子
- 把 metadata-only、首帧预览或 probe 能力包装成「完整支持」
- 把 `planned` / `spike` 写成已经交付；`implemented` 格式可以如实发布，但必须同时标明待验证范围和已知限制

## 5. 页面与站点结构

- **功能放在主域路径**（如 `anyfile.top/view`），不用子域名，集中 SEO 权重
- **`/formats/[extension]`**：每个已交付格式一条静态着陆页，是长尾 SEO 的基本单元
- **`/categories/[slug]`**：类别聚合页，承接 broader 查询
- **sitemap**：格式页、类别页、首页、工作区入口一并提交
- **上线后再激活域名**，确保首次抓取时页面已完整可索引

着陆页最低内容：格式名称、典型用途、支持等级与已知限制、免上传卖点、进入 `/view` 的 CTA、（可选）插件 demo 样例入口。

## 6. 关键词挖掘流程

### 种子词

以 `{extension} viewer online`、`open {extension} without uploading`、`{extension} file viewer free` 为模板，从 catalog 和 [format inventory](../videos/format-inventory.md) 扩词。

### 扩词来源

| 来源 | 用法 |
|---|---|
| SERP / 搜索量工具 | 验证需求规模，比较「viewer online」vs「converter online」意图 |
| Google Trends | 看季节性、地域差异（如 HEIC 在 iPhone 用户群） |
| Reddit、Stack Overflow、论坛 | 找「can't open」「any way to view without installing」类抱怨 |
| 竞品评论与 G2/Capterra | 找上传隐私、文件大小限制、格式不支持等差评 |
| Search Console（上线后） | 零结果查询、高展示低点击词 → 新格式或新着陆页 |

### 工具分工

- 结构化 SEO 数据（DataForSEO 等）交给 AI 做批量扩词与聚类
- 人工终审：去掉 converter/editor 意图过强、与产品能力不符的词

## 7. 格式优先级与 SEO 的衔接

**开发排期仍以各领域 roadmap 与 support-matrix 为准**；SEO 文档只提供「为什么先做它」的推广论据。

新增或推广一个格式时，同步检查：

1. catalog 是否收录，`native` 标记是否准确
2. `/formats/[extension]` 是否生成，文案是否与支持矩阵一致
3. manifest 声明的扩展名是否与着陆页一致
4. 插件目录是否有固定 demo 样例，便于着陆页与 smoke 测试

## 8. 待办备忘

- [ ] 上线前生成全量格式 sitemap
- [ ] 为 catalog 已有但缺着陆页的格式补 `/formats/[extension]`（含 ZIP、RAR 等 archive 族）
- [ ] 配置 Search Console / 分析工具，启动「零结果查询 → 格式 backlog」闭环
