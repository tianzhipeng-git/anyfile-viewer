# Anyfile 格式、类别与插件页面方案

## 1. 目标与结论

Anyfile 为每个已发布的文件格式、格式类别和查看器插件提供稳定、可索引的独立 URL。这些页面用于承接文件查看相关搜索意图、建立站内信息架构，并准确说明 Anyfile 的实际能力、限制与开源依赖。

页面采用“一个页面类型一个 TSX、一个实体一份内容数据”的方式实现：

```text
一个'格式'一个 URL       != 一个格式一个 page.tsx
一个类别一个 URL       != 一个类别一个 page.tsx
一个插件一个 URL       != 一个插件一个 page.tsx
```

三类页面共用各自的动态路由模板，通过 `generateStaticParams()` 在构建时为全部已发布实体生成静态 HTML。搜索引擎和 CDN 看到的是彼此独立的 URL、HTML、元数据和正文，不依赖仓库中是否存在同名物理 TSX 文件。

目标路由如下：

```text
/{locale}/formats/{extension}
/{locale}/categories/{slug}
/{locale}/plugins/{pluginId}
```

本方案遵守 [i18n 与多语言 SEO 规范](i18n.md) 和 [查看器加载与部署规范](../viewer-loading-and-deployment.md)。介绍页面继续使用 SSG；不为 SEO 改成请求时 SSR，也不把整个项目改成 `output: "export"`。

## 2. 页面职责

### 2.1 格式页面：主要搜索落地页

格式页面承接最明确的用户意图，例如：

- `{extension} viewer online`；
- `open {extension} without uploading`；
- `{extension} file viewer free`；
- `how to open {extension}`；
- 音视频格式对应的 `{extension} player online`。

每个已发布格式实体拥有一个主 URL，但“Manifest 中出现一个扩展名”不等于“应生成一个页面”。同一格式的大小写、历史写法或等价扩展名应归一到一个主扩展名。例如 `.jpeg` 通常归一到 `/formats/jpg`，不能让两个近乎相同的页面互相竞争。没有独立内容的别名 URL 优先使用永久重定向；只有因兼容或产品交互必须保留可访问页面时，才使用指向主 URL 的 canonical，并把别名排除在导航和 sitemap 之外。

不同扩展名即使共用同一个查看器，只要对应不同格式规范、容器、用途、限制或明确搜索意图，仍可分别发布。例如 CSV 与 TSV 可以共用表格基础设施，但分隔规则、常见问题和用户任务不同。反过来，扩展名不同但内容与能力说明实质相同，不应为了增加 URL 数量拆成多个页面。

格式从 `draft` 变为 `published` 前必须同时通过两道门槛：

**能力门槛：**

- Manifest 能准确识别该格式，并存在真实的格式感知查看能力；
- 页面承诺已经通过代表性样例验证，且支持范围、子格式和环境条件可被准确说明；
- 只有通用十六进制兜底时，不能包装成对应格式查看器；如确有字节检查需求，应明确以结构或字节检查为页面意图；
- 页面至少映射到一个真实负责该格式的已注册插件。

**内容门槛：**

- 用户对该格式存在可解释的独立任务或搜索意图，而不只是扩展名清单中存在这一项；
- 能提供格式专属的用途、能力、限制、相似格式差异和常见问题；
- 正文不是只替换扩展名、标题、关键词或少量同义句的模板副本；
- 即使搜索量较低，只要内容真实、独特且对用户有用，也可以发布；搜索量用于决定优先级，不作为唯一发布条件。

一个可索引格式页至少应包含：

1. 格式名称、扩展名和用途；
2. Anyfile 能展示的内容；
3. 支持等级的用户可理解说明；
4. 已知限制、受支持子格式及必要的浏览器条件；
5. “文件不上传、在当前设备处理”的准确说明；
6. 打开文件的主操作；
7. 相关类别、相关格式和实际负责的插件；
8. 与该格式直接相关的常见问题；
9. 需要时提供专业软件或其他工具建议。

不得只替换扩展名、标题和一两句话来批量制造页面。页面数量本身不是完成目标，也不会机械增加站点权重；更多高质量页面的作用是覆盖更多真实查询。正文必须反映该格式的真实用途和 Anyfile 的实际能力。尚无足够独特、准确内容的页面可以保留为草稿，但不得进入静态参数、导航或 sitemap。

### 2.2 类别页面：聚合与内链枢纽

类别页面负责解释一组格式的共同使用场景，并把权重和用户导向具体格式页。除格式卡片列表外，页面应根据内容需要包含：

- 类别介绍和典型使用场景；
- 热门或有差异化价值的格式；
- 格式能力对比；
- 浏览器原生查看与专用插件的区别；
- 该类别常见的打不开原因；
- 相关类别和类别级 FAQ。

没有明确用户价值或搜索需求时，不为增加页面数量继续拆分子类别。类别页不得声称整类格式均已完整支持。

### 2.3 插件页面：技术透明度与开源致谢

插件页面不是主要的格式关键词落地页。它负责：

- 解释 Anyfile 如何实现该类文件的本地查看；
- 汇总插件实际声明的格式；
- 说明 probe、Worker、WASM、浏览器能力和主要限制；
- 展示实际使用的上游开源项目、版本、许可证和链接；
- 链接正式的 third-party notices 或许可证文本；
- 连接到由该插件负责的格式页。

插件页标题和正文应聚焦“Anyfile 如何打开此类文件”，避免与格式页争夺相同的 `viewer online` 搜索意图。例如格式页可以使用“Open MKV Files Online”，插件页使用“How Anyfile's Matroska Viewer Works”。

开源致谢是面向用户的摘要，不替代许可证要求的完整 notice、许可证文本、源码说明或分发义务。页面只列出真实进入运行时或分发产物的上游项目；不能把所有间接开发依赖无差别包装为产品致谢。

## 3. 支持等级与替代软件

协议中的支持等级是 `0..5`，含义以 [查看器插件协议](../viewer-plugin-protocol.md#51-全项目支持等级) 为准。同一扩展名的等级可能因文件内容、codec、压缩方式、工作区和浏览器能力而变化，因此 SEO 页面不能把某次运行时 `probe()` 结果当作格式的永久等级。

格式内容模型应记录经过评审的公开能力摘要，包括典型等级、可能范围、条件和限制。例如 TIFF 可以说明常见变体达到完整查看，而未知压缩变体可能只能展示结构或元数据。公开文案不得把动态范围压缩成误导性的单一承诺。

替代软件按实际用户需要决定，不机械执行 `level < 3`：

| 典型能力 | 页面处理方式 |
|---|---|
| 等级 1–2 | 明确说明适合检查或代表性预览；需要主要内容或完整保真时，突出替代软件 |
| 等级 3 | 明确列出缺失能力；只有这些能力对目标用户重要时推荐替代软件 |
| 等级 4–5 | 一般无需推荐其他查看器；如 Anyfile 不提供编辑，可说明编辑仍需专业软件 |

替代软件条目必须包含推荐原因和适用场景。不得仅因为支持等级较低就自动插入未经验证的软件名称，也不得暗示 Anyfile 与被推荐产品存在合作关系。

## 4. 单一事实源与内容分层

### 4.1 三类数据必须分开

```text
插件 Manifest
    └── 可执行能力事实：插件 ID、格式匹配、扩展名、文件名、MIME 提示

结构化支持资料
    └── 公开等级范围、限制、环境条件、实现与验证状态

SEO 编辑内容
    └── 标题、格式介绍、FAQ、替代软件、关键词文案、发布状态
```

插件 Manifest 是运行时能力的权威来源。SEO 内容可以解释、组织和本地化这些事实，但不得复制出另一套互相独立的扩展名和插件映射。

支持等级与验证状态是不同维度：能力已经实现但证据尚未完整时，可以标记待验证；底层依赖理论上支持但产品尚未实现识别和打开路径时，不得对外宣称支持。

### 4.2 当前需要消除的漂移

当前 `src/lib/catalog.ts` 与插件 Manifest 分别手写格式能力，已经存在漂移。例如 catalog 列出 OBJ、glTF、STL、PSD、AI 和 FIG，但当前插件注册表没有对应专用查看器。这些页面不能继续以“受支持格式”身份发布，否则会产生可索引但无法兑现的落地页。

改造时必须选择以下一种明确状态：

- 已有真实查看能力：映射到注册插件并补齐结构化支持资料；
- 只有十六进制兜底：不得表述为对应格式查看器，除非页面明确只承诺字节检查；
- 计划支持：保留为不可索引草稿，不生成公开路由；
- 不再计划支持：从发布目录移除。

### 4.3 SEO 数据不得污染查看页首包

插件 Manifest 必须继续保持轻量纯数据。长篇介绍、FAQ、替代软件、上游项目说明和许可证摘要不得加入协议 Manifest，也不得由 `src/lib/viewer-registrations.ts` 带入 `/view` 首包。

SEO 页面应从独立的服务端内容模块读取轻量 Manifest 和编辑内容。不得为了生成营销页面静态导入插件根入口、probe、Worker、WASM 或完整 renderer。

## 5. 建议的内容模型

以下类型用于表达边界，不要求一次性实现全部字段：

```ts
type PublishStatus = "draft" | "published"

type FormatContent = {
  extension: string
  // 只记录应永久重定向或 canonical 到主扩展名的等价写法
  aliases?: readonly string[]
  categoryId: string
  pluginIds: readonly string[]
  status: PublishStatus
  capability: {
    typicalLevel: 1 | 2 | 3 | 4 | 5
    possibleLevels?: readonly (1 | 2 | 3 | 4 | 5)[]
    conditions?: readonly string[]
    limitations: readonly string[]
    verification: "pending" | "verified"
  }
  alternatives?: readonly {
    name: string
    url: string
    reason: string
  }[]
  seo: {
    title: string
    description: string
    introduction: string
    faq: readonly { question: string; answer: string }[]
  }
}

type PluginContent = {
  pluginId: string
  status: PublishStatus
  summary: string
  architecture: readonly string[]
  limitations: readonly string[]
  upstreamProjects: readonly {
    name: string
    version: string
    projectUrl: string
    license: string
    noticeUrl?: string
    usage: string
  }[]
}
```

`pluginIds` 必须通过构建期派生或校验与注册 Manifest 一致。`typicalLevel` 是对外内容摘要，不替代运行时 probe，也不能参与插件路由。

内容较短时使用类型安全的 TypeScript 数据。随着格式数量增长，优先把单一大文件拆成“一格式一 TS 内容模块”，由一个显式的 `index.ts` 聚合；不要仅因为条目变多就迁移到 JSON。TypeScript 的 `satisfies`、联合类型和编译检查用于保证 locale、发布状态、能力字段和别名规则完整，JSON 只有在引入独立 schema 校验或非开发者内容工作流后才有实际收益。

格式介绍和 FAQ 明显增长后，可以只把长正文迁移到 Markdown/MDX；主扩展名、aliases、路由键、能力映射和发布状态仍应保留为可校验的 TypeScript 结构化数据。不因为“每页独立”而复制页面组件。

建议目录形态：

```text
src/content/
├── formats/
│   ├── pdf.ts
│   ├── mkv.ts
│   └── heic.ts
├── plugins/
│   ├── pdfjs-pdf.ts
│   └── non-native-video.ts
├── categories.ts
└── index.ts

src/app/[locale]/
├── formats/[extension]/page.tsx
├── categories/[slug]/page.tsx
└── plugins/[pluginId]/page.tsx
```

这是目标边界示例，不要求为了目录形式而拆出大量只有几行的文件。当单文件已经影响人工审阅、并行修改或 diff 可读性，或准备批量增加格式时，应在继续扩充前完成按实体拆分。文件拆分应服务于内容审阅和维护，不制造新的抽象层，也不使用运行时目录扫描代替清晰的静态聚合。

## 6. SSG、CDN 与路由约束

格式、类别和插件介绍都不依赖 Cookie、请求头、用户身份或用户文件，应在构建时生成。每个动态路由只为 `published` 实体返回静态参数：

```ts
export function generateStaticParams() {
  return publishedFormats.map(({ extension }) => ({ extension }))
}
```

路由同时遵守以下规则：

- locale 只来自 `PUBLISHED_LOCALES`；
- 未列入静态参数的实体返回 404；
- 等价扩展名别名优先永久重定向到同 locale 的主扩展名 URL；
- 必须保留页面的别名从单独的 alias inventory 生成静态页面，使用主 URL canonical，且不作为主格式进入导航或 sitemap；
- 不在请求时从 CMS 或第三方 API 获取正文；
- `generateMetadata()` 只读取同一份构建期内容；
- 普通介绍页不启用 `/view` 的 COOP/COEP；
- 进入或离开 `/view` 继续通过完整文档导航跨越隔离边界。

普通 `next build` 已能为这些路由生成静态 HTML，并由 Vercel CDN 缓存。SSG 不等于 `output: "export"`：当前项目仍需要 Next.js 路由层为 `/view`、Worker、WASM 和相关资产下发响应头，因此不能仅为了让内容页走 CDN 就改成纯静态导出。

页面内容随 Git 版本发布时，重新构建是最简单、可审计的更新方式。只有将来内容更新频率高到构建不可接受时才评估 ISR；请求时 SSR 不是这些页面的默认方案。

## 7. 页面级 SEO 要求

每个可索引页面必须具备：

- 唯一、准确的本地化 `<title>` 与 description；
- 自引用 canonical；
- 仅包含已发布语言的 `hreflang`，以及英语 `x-default`；
- 与页面正文一致的主标题；
- 首页 → 类别 → 格式，以及格式 ↔ 插件的可抓取内部链接；
- breadcrumb；
- sitemap 条目；
- 不依赖客户端执行才能看到的主要正文；
- 与页面真实内容匹配的结构化数据。

可按页面内容使用 JSON-LD：

- 三级导航使用 `BreadcrumbList`；
- 确实展示问答时使用 `FAQPage`，不能生成页面上看不到的 FAQ；
- 网站或应用总体信息可使用 `WebApplication` / `SoftwareApplication`，但不要为每个格式页虚构一个独立软件产品或评分；
- 结构化数据只帮助表达页面，不保证搜索结果展示增强样式。

页面不能使用以下做法：

- 堆砌 `viewer`、`player`、`online`、`free` 等关键词；
- 为相同内容生成多个大小写或扩展名别名 URL；
- 把“底层库理论支持”写成“Anyfile 已支持”；
- 对只能查看元数据或底层字节的格式声称完整打开；
- 为尚未发布的语言生成英语回退正文；
- 在所有格式页复制完全相同的 FAQ 和介绍段落。

## 8. 构建与发布门禁

新增或修改可索引内容时应自动验证：

1. 每个 published 格式至少映射到一个已注册插件 Manifest，且不是只有通用 hex fallback；
2. 格式声明的主扩展名与 Manifest 一致；
3. alias 不能被多个主格式占用，也不能同时作为另一个 published 格式的主扩展名；
4. alias URL 永久重定向或 canonical 到同 locale 的主 URL，且不进入 sitemap；
5. 每个 published 格式属于一个已发布类别；
6. 每个 published 插件页对应一个真实注册插件；
7. 每个插件页列出的格式反向链接到该插件；
8. 每种已发布语言都有完整 title、description 和主要正文；
9. published 主格式页的 title、description、canonical 和页面 URL 在同一 locale 下唯一；
10. draft、计划中、只有虚假能力映射或未通过内容门槛的实体不进入 sitemap；
11. sitemap、主页面静态参数和导航使用同一份 published inventory；需要保留的 alias 静态参数只来自单独的 alias inventory；
12. SEO 内容没有静态带入 probe、插件实现、Worker 或 WASM。

发布前还应人工抽查：

- 页面承诺与真实样例打开结果一致；
- 等级 1–3 的限制足够醒目且易懂；
- 替代软件建议准确、无合作关系暗示；
- 中英文不是机械直译或英语回退；
- 格式页、类别页和插件页的搜索意图没有明显重复；
- 移动端布局、标题长度、面包屑和内部链接正常。

## 9. 分阶段落地

### 阶段一：修正事实源

- 盘点 `src/lib/catalog.ts` 与全部注册 Manifest；
- 移除、降级或隐藏无法兑现的格式页面；
- 建立 published / draft 状态；
- 建立格式、插件和类别的可校验关系；
- 保持现有格式页、类别页和 sitemap 正常生成。

### 阶段二：补强格式与类别页面

- 在继续扩大格式清单前，把影响审阅的单一内容大文件拆成按实体聚合的 TypeScript 模块；
- 优先完善已有真实支持、搜索意图明确的格式；
- 加入能力、限制、相关格式、FAQ 和必要的替代软件；
- 加强类别页的介绍、对比和内链；
- 补充 canonical、结构化数据和对应测试。

### 阶段三：增加插件页面

- 新增 `/[locale]/plugins/[pluginId]` 共用模板；
- 为每个正式插件整理架构摘要、格式列表和开源致谢；
- 从格式页链接到负责插件，从插件页反向链接到格式页；
- 把插件页加入 sitemap，但保持格式页为核心搜索落地页。

### 阶段四：以真实数据持续优化

- 上线后使用 Search Console 识别高展示低点击和未覆盖查询；
- 根据真实搜索意图扩充内容，而不是仅按格式清单批量生成页面；
- 更新能力或插件时同步修改支持资料、SEO 内容和验证证据；
- 定期检查失效上游链接、过期软件建议和内容漂移。

## 10. 完成标准

本方案完成不以“生成了多少页面”为标准，而以以下结果为标准：

- 每个公开 URL 都对应真实、可解释的产品能力；
- 格式页、类别页和插件页各自承担清晰且不冲突的职责；
- 所有介绍页在构建期生成静态 HTML，并可由 CDN 长期缓存；
- 运行时能力、支持资料和 SEO 文案之间存在自动校验；
- 新增格式或插件时只增加实体内容和必要事实，不复制页面实现；
- 搜索引擎与用户看到的承诺能被实际查看器兑现。
