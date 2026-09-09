export type AppDictionary = {
  feedback: {
    trigger: string; title: string; description: string; close: string;
    category: string; bug: string; feature: string; other: string;
    message: string; messagePlaceholder: string; featurePlaceholder: string;
    format: string; email: string; emailHelp: string; privacy: string;
    submit: string; sending: string; success: string; receipt: string; another: string;
    invalid: string; rateLimited: string; failed: string; unavailable: string;
  };
  metadata: { siteTitle: string; siteDescription: string; viewerTitle: string; viewerDescription: string };
  common: {
    home: string; mainNavigation: string; openFile: string; openFolder: string; categories: string;
    getStarted: string; footerPrivacy: string; copyright: string; native: string; plugin: string;
    learnAndOpen: string; browseFormats: string; directOpen: string; language: string;
    about: string; privacy: string; contact: string; resources: string; email: string; sourceCode: string;
  };
  nav: { media: string; reading: string; designEngineering: string; dataDevelopment: string };
  home: {
    localFirst: string; title: string; description: string; selectFile: string; browse: string; trust: string;
    privacyEyebrow: string; privacyTitle: string; privacyDescription: string;
    principles: readonly { title: string; description: string }[];
    formatsEyebrow: string; formatsTitle: string; formatsDescription: string; browseCount: string;
    openSourceEyebrow: string; openSourceTitle: string; openSourceDescription: string; openSourceCta: string;
    openSourcePrinciples: readonly { title: string; description: string }[];
  };
  category: { home: string; viewerSuffix: string; formats: string; choose: string };
  format: {
    viewerSuffix: string; metadataDescription: string; browserNativeView: string; pluginView: string;
    headline: string; choose: string;
    benefits: readonly { title: string; description: string }[];
  };
  workspace: {
    files: string; fileCount: string; readFileFailed: string; readFolderFailed: string; secureContext: string;
    folderUnsupported: string; pickerFailed: string; droppedEmpty: string; accessErrorTitle: string;
    collapseSidebar: string; expandSidebar: string; chooseLocalFile: string; unopenedTitle: string;
    unopenedDescription: string; preview: string; unknownType: string; workspaceFiles: string;
  };
  viewer: {
    detecting: string; detectionFailed: string; loadingViewer: string; loadingNamedViewer: string;
    workspaceRequired: string; openFailedFallback: string; viewerLabel: string; supportLevelLabel: string;
    supportLevelDescriptions: readonly [string, string, string, string, string, string]; fallbackTitle: string;
    fallbackDescription: string; openingTitle: string; failedTitle: string; noViewerTitle: string;
    selectTitle: string; noPlugin: string; selectDescription: string;
  };
};
