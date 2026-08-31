import { defineFormat } from "./define-format";

export const rarFormat = defineFormat(
  "rar",
  "developer-artifacts",
  2,
  {"name":"RAR archive","title":"Inspect RAR archive Online","description":"Inspect RAR archive metadata locally without uploading or executing its payload.","introduction":"RAR is a proprietary archive family with multi-volume, solid and encrypted variants. Anyfile inspects recognized container metadata locally but does not promise full extraction of entry contents.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Can Anyfile open password-protected RAR contents?","answer":"No. Encrypted payloads are not decrypted; only metadata available without a password can be shown."}]},
  {"name":"RAR 归档","title":"在线检查RAR 归档","description":"无需上传或执行载荷，在本地检查RAR 归档元数据。","introduction":"RAR 是包含分卷、solid 与加密变体的专有归档家族。Anyfile 在本地检查可识别的容器元数据，但不承诺完整解压条目内容。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"Anyfile 能打开受密码保护的 RAR 内容吗？","answer":"不能。加密载荷不会被解密，只展示无需密码即可读取的元数据。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  [],
);

