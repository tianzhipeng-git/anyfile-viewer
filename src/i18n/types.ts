export type AppDictionary = {
  metadata: { siteTitle: string; siteDescription: string; viewerTitle: string; viewerDescription: string; noUploadSuffix: string };
  common: {
    home: string; mainNavigation: string; openFile: string; openFolder: string; categories: string;
    getStarted: string; footerPrivacy: string; copyright: string; native: string; plugin: string;
    learnAndOpen: string; browseFormats: string; directOpen: string; language: string;
    about: string; privacy: string; contact: string; resources: string; email: string; sourceCode: string;
  };
  nav: { imagesVideo: string; documents: string; codeData: string; developerArtifacts: string; threeD: string; design: string };
  home: {
    localFirst: string; title: string; description: string; selectFile: string; browse: string; trust: string;
    privacyEyebrow: string; privacyTitle: string; privacyDescription: string;
    principles: readonly { title: string; description: string }[];
    formatsEyebrow: string; formatsTitle: string; formatsDescription: string; browseCount: string;
    popularFormatsTitle: string; popularFormatsDescription: string;
  };
  category: { home: string; viewerSuffix: string; localSuffix: string; formats: string; choose: string };
  format: {
    viewerSuffix: string; metadataDescription: string; browserNativeView: string; pluginView: string;
    headline: string; privacySuffix: string; choose: string;
    benefits: readonly { title: string; description: string }[];
  };
  workspace: {
    files: string; fileCount: string; readFileFailed: string; readFolderFailed: string; secureContext: string;
    folderUnsupported: string; pickerFailed: string; droppedEmpty: string; duplicateFileNames: string; accessErrorTitle: string;
    collapseSidebar: string; expandSidebar: string; chooseLocalFile: string; unopenedTitle: string;
    unopenedDescription: string; preview: string; unknownType: string; workspaceFiles: string;
  };
  viewer: {
    detecting: string; detectionFailed: string; loadingViewer: string; loadingNamedViewer: string;
    workspaceRequired: string; openFailedFallback: string; viewerLabel: string; fallbackTitle: string;
    fallbackDescription: string; openingTitle: string; failedTitle: string; noViewerTitle: string;
    selectTitle: string; noPlugin: string; selectDescription: string;
  };
};
