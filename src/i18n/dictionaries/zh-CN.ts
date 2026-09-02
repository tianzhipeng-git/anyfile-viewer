import type { AppDictionary } from "../types";

const dictionary = {
  metadata: {
    siteTitle: "Anyfile — 免费在线文件查看器", siteDescription: "免费的在线文件查看器：快速、私密地打开文档、图片、音视频、代码与数据文件，无需上传、注册账户或安装软件。",
    viewerTitle: "免费在线文件查看器", viewerDescription: "使用快速、私密的在线查看器打开受支持文件。完全免费，文件留在当前设备，无需上传。",
    noUploadSuffix: " 无需上传。",
  },
  common: {
    home: "首页", mainNavigation: "主要导航", openFile: "打开文件", openFolder: "打开文件夹",
    categories: "格式类别", getStarted: "开始使用",
    footerPrivacy: "文件始终留在你的设备上。Anyfile 只使用浏览器本地能力完成读取与预览。",
    copyright: "© 2026 Anyfile. 本地优先，隐私始终如一。", native: "浏览器原生", plugin: "插件",
    learnAndOpen: "了解并打开", browseFormats: "浏览支持格式", directOpen: "直接打开文件", language: "语言",
    about: "关于", privacy: "隐私政策", contact: "联系", resources: "Anyfile", email: "邮箱", sourceCode: "开源地址",
  },
  nav: {
    imagesVideo: "图片与音视频", documents: "文档", codeData: "数据",
    developerArtifacts: "开发者", threeD: "3D", design: "设计",
  },
  home: {
    localFirst: "免费在线文件查看器", title: "在线打开文件，无需上传。",
    description: "快速、私密地查看受支持的图片、文档、音视频、代码与数据。完全免费，文件始终留在当前设备。",
    selectFile: "选择本地文件", browse: "浏览支持格式", trust: "本地处理 · 无需注册 · 免费使用",
    privacyEyebrow: "默认保护隐私", privacyTitle: "你的文件，只属于你。",
    privacyDescription: "Anyfile 直接读取你明确选择的本地文件。预览、解码与渲染全部发生在当前浏览器标签页中。",
    principles: [
      { title: "不上传", description: "文件内容不会离开你的设备，也不经过服务器中转。" },
      { title: "打开就看", description: "省去上传和下载等待，充分利用浏览器原生解码能力。" },
      { title: "从文件到文件夹", description: "单个文件快速查看，也支持以工作区方式浏览关联资源。" },
    ],
    formatsEyebrow: "支持的格式", formatsTitle: "找到你要打开的格式。",
    formatsDescription: "从浏览器原生支持到专用查看器插件，统一在清晰的类别中。", browseCount: "浏览 {count} 种格式",
    popularFormatsTitle: "常用文件查看器",
    popularFormatsDescription: "直接查看常见格式的使用说明、已支持能力与已知限制。",
  },
  category: { home: "首页", viewerSuffix: "查看器", localSuffix: " 所有处理都在当前设备完成。", formats: "种格式", choose: "选择一种文件格式" },
  format: {
    viewerSuffix: "查看器", metadataDescription: "在浏览器本地查看 {name}。{description}",
    browserNativeView: "浏览器原生查看", pluginView: "专用插件查看", headline: "{name}，打开就看。",
    privacySuffix: " 无需上传，处理仅在浏览器本地进行。", choose: "选择 .{extension} 文件",
    benefits: [
      { title: "更快", description: "跳过文件上传与云端处理队列。" },
      { title: "更私密", description: "文件内容不会发送到 Anyfile 服务器。" },
      { title: "更简单", description: "无需安装桌面软件，也无需注册账户。" },
    ],
  },
  workspace: {
    files: "文件", fileCount: "{count} 个文件", readFileFailed: "无法读取所选文件。请重新授权后再试。",
    readFolderFailed: "无法读取所选文件夹。请重新授权后再试。", secureContext: "File System Access API 只能在安全上下文中使用。请通过 HTTPS 或 localhost 访问。",
    folderUnsupported: "当前浏览器不支持打开文件夹，仅可打开单个文件。请使用最新版 Chrome 或其他兼容浏览器。",
    pickerFailed: "无法打开文件夹选择器。", droppedEmpty: "拖放内容中没有可读取的文件。",
    duplicateFileNames: "所选文件中存在重名文件，无法建立无歧义的工作区。", accessErrorTitle: "无法访问本地文件",
    collapseSidebar: "收起文件栏", expandSidebar: "展开文件栏", chooseLocalFile: "选择本地文件",
    unopenedTitle: "尚未打开工作区", unopenedDescription: "授权文件或文件夹后，这里会显示句柄树。",
    preview: "预览区", unknownType: "未知类型", workspaceFiles: "工作区文件",
  },
  viewer: {
    detecting: "正在检测文件格式并选择查看器…", detectionFailed: "无法检测这个文件的格式。", loadingViewer: "正在加载查看器…",
    loadingNamedViewer: "正在加载{name}…", workspaceRequired: "此查看器需要从文件夹工作区打开文件。",
    openFailedFallback: "无法打开这个文件。", viewerLabel: "查看器", supportLevelLabel: "支持等级 {level}",
    supportLevelDescriptions: [
      "Anyfile 当前无法有意义地打开此文件。这表示我们尚未提供相应查看能力，不代表文件损坏或存在问题。",
      "Anyfile 当前只能检查底层字节、元数据或结构。这表示我们的查看能力有限，不代表文件质量差或内容有问题。",
      "Anyfile 当前只能提供缩略图、摘要或代表性内容。这表示我们的查看能力尚不完整，不代表文件质量差或内容有问题。",
      "可以查看主要内容，但部分重要的格式能力尚未覆盖。",
      "在声明的支持范围内，可以完整查看主要内容和常见格式语义。",
      "可以完整查看主要内容，并提供理解该格式所需的专业导航或交互。",
    ],
    fallbackTitle: "暂不支持此文件类型的专用预览",
    fallbackDescription: "当前以十六进制展示文件的原始内容。", openingTitle: "正在打开文件", failedTitle: "查看器打开失败",
    noViewerTitle: "没有匹配的查看器", selectTitle: "选择本地文件", noPlugin: "当前没有支持 {extension} 格式的插件。",
    selectDescription: "选择 PDF、表格、代码、文本或结构化数据文件，内容只在浏览器本地处理。",
  },
} as const satisfies AppDictionary;

export default dictionary;
