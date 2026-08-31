import { defineFormat } from "./define-format";

export const xzFormat = defineFormat(
  "xz",
  "developer-artifacts",
  2,
  {"name":"XZ stream","title":"Inspect XZ stream Online","description":"Inspect XZ stream metadata locally without uploading or executing its payload.","introduction":"XZ is a container for LZMA2-compressed streams with checks and optional indexing. Anyfile reads bounded container metadata locally; TAR member browsing requires a valid inner TAR layer.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Can Anyfile decompress arbitrary XZ payloads?","answer":"The page promises structural inspection, not general-purpose extraction. Use an archive utility for exported files."}]},
  {"name":"XZ 压缩流","title":"在线检查XZ 压缩流","description":"无需上传或执行载荷，在本地检查XZ 压缩流元数据。","introduction":"XZ 是承载 LZMA2 压缩流的容器，包含校验与可选索引。Anyfile 在本地读取有界容器元数据；浏览 TAR 成员需要有效的内部 TAR 层。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"Anyfile 能解压任意 XZ 载荷吗？","answer":"本页只承诺结构检查，不是通用解压工具；需要导出文件时请使用归档工具。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["txz","tar.xz"],
);

