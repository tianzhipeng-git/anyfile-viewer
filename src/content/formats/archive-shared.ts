import type { FormatContent } from "../types";

export const archiveInspectionCapability: Partial<FormatContent["capability"]> = { possibleLevels: [1, 2] };

const alternative = (name: string, url: string, en: string, zh: string): FormatContent["alternatives"] => [{
  name, url, reason: { en, "zh-CN": zh },
}];

export const archiveToolAlternative = alternative("7-Zip", "https://www.7-zip.org/", "Use an archive utility when you need to extract, verify or change package contents.", "需要解压、校验或修改软件包内容时，请使用归档工具。");
export const androidStudioAlternative = alternative("Android Studio", "https://developer.android.com/studio", "Use Android tooling when you need manifest decoding, signing checks, installation or app analysis.", "需要解码 manifest、检查签名、安装或分析应用时，请使用 Android 工具。");
export const calibreAlternative = alternative("calibre", "https://calibre-ebook.com/", "Use an e-book reader when you need paginated book content, navigation and reading features.", "需要分页正文、导航与阅读功能时，请使用电子书阅读器。");
export const libreOfficeAlternative = alternative("LibreOffice", "https://www.libreoffice.org/", "Use an office suite when you need rendered document content, layout fidelity or editing.", "需要渲染文档正文、版式保真或编辑时，请使用办公套件。");
export const xcodeAlternative = alternative("Xcode", "https://developer.apple.com/xcode/", "Use Apple's development tools when you need signing, provisioning or installation analysis.", "需要分析签名、provisioning 或安装信息时，请使用 Apple 开发工具。");
