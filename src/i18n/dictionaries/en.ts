import type { AppDictionary } from "../types";

const dictionary = {
  metadata: {
    siteTitle: "Anyfile — Free online file viewer",
    siteDescription: "Open documents, images, media, code and data with a fast, private online file viewer. Free to use, with no uploads or desktop software.",
    viewerTitle: "Free online file viewer",
    viewerDescription: "Open supported files instantly with a fast, private online viewer. Free to use; files stay on your device and are never uploaded.",
    noUploadSuffix: " No upload required.",
  },
  common: {
    home: "Home", mainNavigation: "Main navigation", openFile: "Open file", openFolder: "Open folder",
    categories: "Format categories", getStarted: "Get started",
    footerPrivacy: "Your files stay on your device. Anyfile reads and previews them using local browser capabilities only.",
    copyright: "© 2026 Anyfile. Local first, privacy always.", native: "Browser native", plugin: "Plugin",
    learnAndOpen: "Learn and open", browseFormats: "Browse supported formats", directOpen: "Open a file now", language: "Language",
    about: "About", privacy: "Privacy policy", contact: "Contact", resources: "Anyfile", email: "Email", sourceCode: "Source code",
  },
  nav: {
    imagesVideo: "Images & Media", documents: "Documents", codeData: "Data",
    developerArtifacts: "Developer", threeD: "3D", design: "Design",
  },
  home: {
    localFirst: "FREE ONLINE FILE VIEWER", title: "Open files online without uploading.",
    description: "Use a fast, private viewer for supported images, documents, media, code and data. It is free, and your files stay on your device.",
    selectFile: "Choose a local file", browse: "Browse supported formats", trust: "Local processing · No account · Free to use",
    privacyEyebrow: "PRIVACY BY DEFAULT", privacyTitle: "Your files belong to you.",
    privacyDescription: "Anyfile reads only the files you choose. Previewing, decoding and rendering all happen in this browser tab.",
    principles: [
      { title: "No uploads", description: "File contents never leave your device or pass through our servers." },
      { title: "Open instantly", description: "Skip upload and download queues by using native browser capabilities." },
      { title: "Files and folders", description: "Open a single file or browse related resources as a workspace." },
    ],
    formatsEyebrow: "SUPPORTED FORMATS", formatsTitle: "Find the format you need.",
    formatsDescription: "Browser-native formats and dedicated viewer plugins, organized into clear categories.",
    browseCount: "Browse {count} formats",
    popularFormatsTitle: "Popular file viewers",
    popularFormatsDescription: "Go directly to practical guides, supported features and known limits for commonly opened formats.",
  },
  category: { home: "Home", viewerSuffix: " viewers", localSuffix: " Everything is processed on this device.", formats: "FORMATS", choose: "Choose a file format" },
  format: {
    viewerSuffix: " viewer", metadataDescription: "View {name} locally in your browser. {description}",
    browserNativeView: "Browser-native viewing", pluginView: "Dedicated plugin", headline: "Open {name} instantly.",
    privacySuffix: " No upload required; processing stays in your browser.", choose: "Choose a .{extension} file",
    benefits: [
      { title: "Faster", description: "Skip file uploads and cloud processing queues." },
      { title: "More private", description: "File contents are never sent to Anyfile servers." },
      { title: "Simpler", description: "No desktop software or account is required." },
    ],
  },
  workspace: {
    files: "Files", fileCount: "{count} files", readFileFailed: "Unable to read the selected file. Authorize access and try again.",
    readFolderFailed: "Unable to read the selected folder. Authorize access and try again.",
    secureContext: "The File System Access API requires HTTPS or localhost.",
    folderUnsupported: "This browser cannot open folders. Use the latest Chrome or another compatible browser, or open individual files.",
    pickerFailed: "Unable to open the folder picker.", droppedEmpty: "The dropped content contains no readable files.",
    accessErrorTitle: "Unable to access local files", collapseSidebar: "Collapse file sidebar", expandSidebar: "Expand file sidebar",
    chooseLocalFile: "Choose local files", unopenedTitle: "No workspace open", unopenedDescription: "Choose files or a folder to display them here.",
    preview: "Preview", unknownType: "Unknown type", workspaceFiles: "Workspace files",
  },
  viewer: {
    detecting: "Detecting the file format and choosing a viewer…", detectionFailed: "Unable to detect this file format.",
    loadingViewer: "Loading viewer…", loadingNamedViewer: "Loading {name}…",
    workspaceRequired: "This viewer requires the file to be opened from a folder workspace.",
    openFailedFallback: "Unable to open this file.", viewerLabel: "Viewer",
    fallbackTitle: "No dedicated preview for this file type", fallbackDescription: "The raw file contents are shown in hexadecimal.",
    openingTitle: "Opening file", failedTitle: "Viewer failed to open", noViewerTitle: "No matching viewer",
    selectTitle: "Choose a local file", noPlugin: "No plugin currently supports the {extension} format.",
    selectDescription: "Choose a PDF, spreadsheet, code, text or structured data file. Its contents stay in your browser.",
  },
} as const satisfies AppDictionary;

export default dictionary;
