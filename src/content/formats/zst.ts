import { defineFormat } from "./define-format";

export const zstFormat = defineFormat(
  "zst",
  "developer-artifacts",
  2,
  {"name":"Zstandard frame","title":"Inspect Zstandard frame Online","description":"Inspect Zstandard frame metadata locally without uploading or executing its payload.","introduction":"Zstandard stores fast compressed frames with optional content size, checksum and dictionary identifiers. Anyfile inspects those frame properties locally without treating every payload as an archive.","canShow":["Recognized headers and container properties","Bounded entry or stream metadata when available"],"limitations":["This is structural inspection, not a full extraction workflow","Encrypted, corrupt or extreme inputs can be rejected"],"faq":[{"question":"Why might a ZST frame need a dictionary?","answer":"Some producers compress against an external dictionary; metadata can be readable even when that payload cannot be decoded alone."}]},
  {"name":"Zstandard 帧","title":"在线检查Zstandard 帧","description":"无需上传或执行载荷，在本地检查Zstandard 帧元数据。","introduction":"Zstandard 使用可选内容大小、校验和与字典标识保存高速压缩帧。Anyfile 在本地检查这些帧属性，不把每个载荷都当作归档。","canShow":["可识别文件头与容器属性","存在时的有界条目或流元数据"],"limitations":["这是结构检查，不是完整解压工作流","加密、损坏或极端输入可能被拒绝"],"faq":[{"question":"为什么 ZST 帧可能需要字典？","answer":"部分生产者使用外部字典压缩；即使载荷无法单独解码，元数据仍可能可读。"}]},
  { possibleLevels: [1, 2] },
  [{ name: "7-Zip", url: "https://www.7-zip.org/", reason: { en: "Use a dedicated archive utility when you need to extract, test or create archive contents.", "zh-CN": "需要解压、测试或创建归档内容时，请使用专用归档工具。" } }],
  ["zstd","tzst","tar.zst","tar.zstd"],
);

