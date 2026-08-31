import { defineFormat } from "./define-format";

export const gzFormat = defineFormat(
  "gz",
  "developer-artifacts",
  2,
  {"name":"gzip stream","title":"Inspect gzip stream Online","description":"Inspect gzip stream metadata locally without uploading or executing its payload.","introduction":"gzip wraps one compressed data stream with a compact header and trailer; .tgz and .tar.gz commonly contain a TAR archive inside. Anyfile reports available stream metadata and recognizes the layered naming.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Does a .gz file contain a browsable file list?","answer":"Not by itself. A plain gzip stream has one payload; a file list comes from an inner format such as TAR."}]},
  {"name":"gzip 压缩流","title":"在线检查gzip 压缩流","description":"无需上传或执行载荷，在本地检查gzip 压缩流元数据。","introduction":"gzip 用简短文件头与尾部封装单个压缩数据流；.tgz 与 .tar.gz 通常在其中包含 TAR。Anyfile 报告可用流元数据并识别这种分层命名。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":".gz 文件包含可浏览的文件列表吗？","answer":"单独没有。普通 gzip 流只有一个载荷；文件列表来自 TAR 等内部格式。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["gzip","tgz","tar.gz","crate"],
);

