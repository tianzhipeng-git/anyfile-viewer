# Anyfile Viewer

**直接在浏览器中，打开更多格式的文件。**

[English](README.md) · 简体中文

[打开查看器](https://www.anyfile.top/zh-CN/view) · [浏览文件格式](https://www.anyfile.top/zh-CN) · [报告问题](https://github.com/tianzhipeng-git/anyfile-viewer/issues)

Anyfile Viewer 是一个免费、开源的文件查看器，在你的设备上读取和预览本地文件。无需安装桌面软件，无需注册账号，也无需上传文件进行预览。

项目优先追求广泛的格式覆盖，提供实用、快速的只读预览。专注于查看，不提供编辑；同时注重轻量启动，以及处理大文件时的资源控制。

## 可以打开什么

| 类别 | 格式示例 |
| --- | --- |
| 文档与电子表格 | PDF、DOCX、PPTX、XLSX、XLS、XLSB、ODS、Numbers |
| 图片与设计文件 | JPEG、PNG、WebP、SVG、TIFF、HEIC/HEIF、JPEG XL、相机 RAW、PSD、PXD、EPS/PostScript |
| 音频与视频 | MP3、WAV、FLAC、Ogg、MP4、WebM、MOV、MKV，以及部分浏览器非原生编码 |
| 360° 相机媒体 | 受支持的 Insta360、GoPro MAX 和 DJI Osmo 360 照片与视频 |
| 电子书与漫画 | EPUB、无加密 MOBI/AZW3、FictionBook、CBZ、CBR |
| 数据与数据库 | CSV、JSON、Parquet、Arrow、DuckDB、SQLite、HAR |
| CAD、3D 与点云 | DXF、DWG、STEP、IGES、OBJ、glTF/GLB、STL、3MF、LAS/LAZ、PCD |
| 代码与开发文件 | 源码、配置文件、NumPy 数组、Source Map、WebAssembly 结构 |
| 归档与软件包 | ZIP、RAR、7z、TAR 及受支持软件包格式的文件列表与元数据 |
| 其他二进制文件 | 通过十六进制查看器检查文件内容 |

以上仅为示例，并非完整兼容列表。不同格式的预览深度不同：有些支持完整页面或交互式模型，有些提供内嵌预览、结构或元数据。音视频能否播放取决于容器中的编码及浏览器能力；大文件仍受设备内存和浏览器限制。

各格式的具体能力与限制请查看[格式目录](https://www.anyfile.top/zh-CN)。

## 开始使用

1. 打开[查看器工作区](https://www.anyfile.top/zh-CN/view)。
2. 选择文件、将文件拖入工作区，或在浏览器支持时打开文件夹。
3. 在侧边栏选择文件，加载对应查看器。

界面支持英语和简体中文。文件夹访问及部分解码功能取决于浏览器能力。

### 本地处理与隐私

所选文件在浏览器中读取、解码和渲染，不会上传文件内容进行转换或预览。查看器代码、WebAssembly 解码器及其他运行时资源可能按需从网络下载，因此本地处理不等于完全离线运行。

线上站点使用 Vercel Analytics 和 Speed Insights。反馈仅在你提交表单时发送，不会附带你的文件。详情请阅读[隐私政策](https://www.anyfile.top/zh-CN/privacy)。

## 本地运行

需要 **Node.js 24.x** 和 **pnpm 10.32.1**。

```bash
git clone https://github.com/tianzhipeng-git/anyfile-viewer.git
cd anyfile-viewer
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。根路径默认跳转至 `/en`；中文工作区位于 `/zh-CN/view`。

`pnpm dev` 和 `pnpm build` 会自动准备所需的浏览器资源。常规应用构建使用仓库中已有或依赖包提供的运行时产物，不会从源码编译原生依赖。

可在 `.env.local` 中配置以下可选环境变量：

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | 页面元数据使用的站点地址；开发环境默认为 localhost，生产环境默认为 `https://www.anyfile.top`。 |
| `NEXT_PUBLIC_FEEDBACK_ENDPOINT` | 启用反馈提交，对接独立的 Cloudflare Worker + D1 服务。不配置时禁用提交。 |

反馈服务的配置与部署见[反馈服务说明](services/feedback/README.md)。

### 验证与构建

```bash
pnpm test
pnpm lint
pnpm build
pnpm start
```

`pnpm test` 执行应用与工作区包的测试。生产构建还会检查查看器的分包边界、初始 JavaScript 体积和运行时资源策略。

单独测试某个插件：

```bash
pnpm --filter @anyfile/pdf-viewer test
```

部署时按 Next.js 应用运行，并保留 `next.config.ts` 中的响应头，包括查看器所需的跨源隔离响应头。详见[加载与部署约定](docs/viewer-loading-and-deployment.md)。

## 项目结构

项目使用 Next.js、React、TypeScript 和 pnpm workspace，通过统一的查看器协议按需加载各格式实现。

| 路径 | 职责 |
| --- | --- |
| `src/app/[locale]/` | 多语言页面：首页、分类、格式、插件详情与查看器工作区 |
| `src/components/` | 网站外壳与文件工作区 |
| `src/content/` | 格式目录与双语页面内容 |
| `src/lib/viewer-registrations.ts` | 插件注册与动态加载 |
| `viewer/plugins/` | 各格式查看器 |
| `viewer/protocol/` | 宿主与插件的接口及校验 |
| `viewer/ui/`、`viewer/rendering*/` | 共享 UI 与渲染基础设施 |
| `viewer/runtime-assets/`、`viewer/plugin-policies.json` | 运行时资源加载与策略 |
| `tools/`、`third_party/` | 源码构建配方与经审核的第三方产物 |
| `services/feedback/` | 可选反馈后端 |

## 参与贡献

欢迎报告问题、增加格式查看器或改善现有预览。提交可复现的问题时，请注明文件扩展名、浏览器版本、预期结果和实际表现；如需样例，请使用不含敏感信息的文件。

修改查看器前，请按任务范围阅读项目规范：

- [插件协议](docs/viewer-plugin-protocol.md)：Manifest、插件选择、工作区访问与生命周期。
- [渲染规范](docs/viewer-rendering-guidelines.md)：布局、异步渲染、无障碍与内容安全。
- [加载与部署约定](docs/viewer-loading-and-deployment.md)：动态导入、Worker/WASM、运行时资源与响应头。
- [共享 UI 与渲染架构](docs/viewer-ui-and-rendering-architecture.md)：共享包与渲染器的职责边界。
- [源码构建依赖规范](docs/viewer-source-built-dependencies.md)：构建配方、补丁与第三方产物管理。

保持本地、只读预览，按需加载重型依赖，并如实说明各格式支持的范围。

## 许可证

项目自有代码使用 [Apache-2.0](LICENSE) 许可证。第三方库与运行时资源遵循各自的许可证，详见 [NOTICE](NOTICE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
